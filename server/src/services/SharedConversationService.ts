import { getDatabase, SharedConversation, ShareConversationRequest, ConversationMessage } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { redisCache } from '../cache/RedisCache';

export class SharedConversationService {
  private static instance: SharedConversationService;

  private constructor() {}

  public static getInstance(): SharedConversationService {
    if (!SharedConversationService.instance) {
      SharedConversationService.instance = new SharedConversationService();
    }
    return SharedConversationService.instance;
  }

  /**
   * Create a new shared conversation
   */
  public async createSharedConversation(request: ShareConversationRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const shareId = uuidv4();
      
      // Calculate expiration date if specified
      let expiresAt: string | null = null;
      if (request.expires_in_days && request.expires_in_days > 0) {
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + request.expires_in_days);
        expiresAt = expireDate.toISOString();
      }

      const query = `
        INSERT INTO shared_conversations (
          id, title, messages, persona_id, user_email, owner_id, access_code, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const messagesJson = JSON.stringify(request.messages);

      db.run(
        query,
        [shareId, request.title, messagesJson, request.persona_id, request.user_email, request.owner_id, request.access_code, expiresAt],
        async function(err) {
          if (err) {
            console.error('Error creating shared conversation:', err);
            reject(err);
            return;
          }

          // Cache the newly created conversation
          const conversation: SharedConversation = {
            id: shareId,
            title: request.title,
            messages: messagesJson,
            persona_id: request.persona_id,
            user_email: request.user_email,
            owner_id: request.owner_id,
            access_code: request.access_code,
            created_at: new Date().toISOString(),
            expires_at: expiresAt || undefined,
            view_count: 0,
            is_public: true,
            is_active: true
          };

          // Cache for 1 hour by default
          await redisCache.setConversation(shareId, conversation, 3600);

          console.log(`Created shared conversation with ID: ${shareId}`);
          resolve(shareId);
        }
      );
    });
  }

  /**
   * Get a shared conversation by ID
   */
  public async getSharedConversation(shareId: string): Promise<SharedConversation | null> {
    try {
      // Try Redis cache first
      const cached = await redisCache.getConversation(shareId);
      if (cached) {
        // Verify it's still active and not expired
        if (!cached.is_active || !cached.is_public) {
          await redisCache.deleteConversation(shareId);
          return null;
        }

        if (cached.expires_at) {
          const expirationDate = new Date(cached.expires_at);
          const now = new Date();

          if (now > expirationDate) {
            await redisCache.deleteConversation(shareId);
            return null;
          }
        }

        // Increment view count asynchronously
        this.incrementViewCount(shareId).catch(console.error);
        return cached;
      }

      // Cache miss - fetch from database
      return new Promise((resolve, reject) => {
        const db = getDatabase();

        const query = `
          SELECT * FROM shared_conversations
          WHERE id = ? AND is_public = 1 AND is_active = 1
        `;

        db.get(query, [shareId], async (err, row: SharedConversation) => {
          if (err) {
            console.error('Error fetching shared conversation:', err);
            reject(err);
            return;
          }

          if (!row) {
            resolve(null);
            return;
          }

          // Check if conversation has expired
          if (row.expires_at) {
            const expirationDate = new Date(row.expires_at);
            const now = new Date();

            if (now > expirationDate) {
              console.log(`Shared conversation ${shareId} has expired`);
              resolve(null);
              return;
            }
          }

          // Cache the conversation for future requests
          const ttl = row.expires_at ?
            Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000) :
            3600; // 1 hour default

          await redisCache.setConversation(shareId, row, Math.max(ttl, 60)); // Minimum 1 minute

          // Increment view count
          this.incrementViewCount(shareId).catch(console.error);

          resolve(row);
        });
      });
    } catch (error) {
      console.error('Error in getSharedConversation:', error);
      // Fallback to database only
      return this.getSharedConversationFromDB(shareId);
    }
  }

  /**
   * Fallback method to get conversation from database only
   */
  private async getSharedConversationFromDB(shareId: string): Promise<SharedConversation | null> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();

      const query = `
        SELECT * FROM shared_conversations
        WHERE id = ? AND is_public = 1 AND is_active = 1
      `;

      db.get(query, [shareId], (err, row: SharedConversation) => {
        if (err) {
          console.error('Error fetching shared conversation from DB:', err);
          reject(err);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        // Check if conversation has expired
        if (row.expires_at) {
          const expirationDate = new Date(row.expires_at);
          const now = new Date();

          if (now > expirationDate) {
            console.log(`Shared conversation ${shareId} has expired`);
            resolve(null);
            return;
          }
        }

        // Increment view count
        this.incrementViewCount(shareId).catch(console.error);

        resolve(row);
      });
    });
  }

  /**
   * Get parsed messages from a shared conversation
   */
  public async getSharedConversationMessages(shareId: string): Promise<ConversationMessage[] | null> {
    const conversation = await this.getSharedConversation(shareId);
    
    if (!conversation) {
      return null;
    }

    try {
      const messages: ConversationMessage[] = JSON.parse(conversation.messages);
      return messages;
    } catch (error) {
      console.error('Error parsing conversation messages:', error);
      return null;
    }
  }

  /**
   * Increment view count for a shared conversation
   */
  private async incrementViewCount(shareId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      const query = `
        UPDATE shared_conversations 
        SET view_count = view_count + 1 
        WHERE id = ?
      `;

      db.run(query, [shareId], function(err) {
        if (err) {
          console.error('Error incrementing view count:', err);
          reject(err);
          return;
        }
        
        resolve();
      });
    });
  }

  /**
   * Delete expired conversations (cleanup utility)
   */
  public async cleanupExpiredConversations(): Promise<number> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const query = `
        DELETE FROM shared_conversations 
        WHERE expires_at IS NOT NULL AND expires_at < ?
      `;

      db.run(query, [now], function(err) {
        if (err) {
          console.error('Error cleaning up expired conversations:', err);
          reject(err);
          return;
        }
        
        console.log(`Cleaned up ${this.changes} expired conversations`);
        resolve(this.changes);
      });
    });
  }

  /**
   * Unshare a conversation (mark as inactive)
   */
  public async unshareConversation(shareId: string, ownerId?: string, accessCode?: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();

      // First verify ownership
      const verifyQuery = `
        SELECT owner_id, access_code FROM shared_conversations
        WHERE id = ? AND is_active = 1
      `;

      db.get(verifyQuery, [shareId], (err, row: any) => {
        if (err) {
          console.error('Error verifying ownership:', err);
          reject(err);
          return;
        }

        if (!row) {
          console.log(`Conversation ${shareId} not found or already inactive`);
          resolve(false);
          return;
        }

        // Check ownership - either by owner_id or access_code
        const hasOwnership = (ownerId && row.owner_id === ownerId) ||
                           (accessCode && row.access_code === accessCode);

        if (!hasOwnership) {
          console.log(`Unauthorized unshare attempt for ${shareId}`);
          resolve(false);
          return;
        }

        // Mark as inactive instead of deleting
        const updateQuery = `
          UPDATE shared_conversations
          SET is_active = 0, is_public = 0
          WHERE id = ?
        `;

        db.run(updateQuery, [shareId], async function(err) {
          if (err) {
            console.error('Error unsharing conversation:', err);
            reject(err);
            return;
          }

          // Remove from Redis cache
          await redisCache.deleteConversation(shareId);

          console.log(`Conversation ${shareId} unshared successfully`);
          resolve(this.changes > 0);
        });
      });
    });
  }

  /**
   * Get conversations owned by a user
   */
  public async getOwnedConversations(ownerId?: string, accessCode?: string): Promise<SharedConversation[]> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();

      let query = `
        SELECT id, title, created_at, expires_at, view_count, is_active, is_public
        FROM shared_conversations
        WHERE 1=1
      `;
      const params: any[] = [];

      if (ownerId) {
        query += ` AND owner_id = ?`;
        params.push(ownerId);
      } else if (accessCode) {
        query += ` AND access_code = ?`;
        params.push(accessCode);
      } else {
        // No ownership criteria provided
        resolve([]);
        return;
      }

      query += ` ORDER BY created_at DESC`;

      db.all(query, params, (err, rows: any[]) => {
        if (err) {
          console.error('Error fetching owned conversations:', err);
          reject(err);
          return;
        }

        resolve(rows as SharedConversation[]);
      });
    });
  }

  /**
   * Get Redis cache statistics
   */
  public async getCacheStats(): Promise<any> {
    try {
      return await redisCache.getStats();
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        totalKeys: 0,
        memoryUsage: '0B',
        hitCount: 0,
        missCount: 0,
        hitRate: 0,
        uptime: 0,
        status: 'unavailable'
      };
    }
  }

  /**
   * Clear all cached conversations
   */
  public async clearCache(): Promise<void> {
    try {
      await redisCache.clearAll();
      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Check Redis health
   */
  public async getCacheHealth(): Promise<any> {
    try {
      return await redisCache.healthCheck();
    } catch (error) {
      console.error('Error checking cache health:', error);
      return { status: 'unhealthy', error: 'Health check failed' };
    }
  }

  /**
   * Get conversation statistics
   */
  public async getConversationStats(shareId: string): Promise<{ viewCount: number; createdAt: string } | null> {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      const query = `
        SELECT view_count, created_at 
        FROM shared_conversations 
        WHERE id = ?
      `;

      db.get(query, [shareId], (err, row: any) => {
        if (err) {
          console.error('Error fetching conversation stats:', err);
          reject(err);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        resolve({
          viewCount: row.view_count,
          createdAt: row.created_at
        });
      });
    });
  }
}
