import { config } from '../config';
import { sharedConversationCache, SharedConversationData, ConversationMessage } from './SharedConversationCache';
import { logger } from '../utils/logger';

interface ShareConversationRequest {
  title: string;
  messages: ConversationMessage[];
  persona_id?: string;
  expires_in_days?: number;
}

interface ShareConversationResponse {
  success: boolean;
  shareId?: string;
  shareUrl?: string;
  unshareUrl?: string;
  error?: string;
}

interface UnshareConversationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface OwnedConversation {
  id: string;
  title: string;
  created_at: string;
  expires_at?: string;
  view_count: number;
  is_active: boolean;
  is_public: boolean;
}

interface GetConversationResponse {
  success: boolean;
  conversation?: SharedConversationData;
  error?: string;
}

class SharedConversationService {
  private static instance: SharedConversationService;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = config.server.url;
  }

  public static getInstance(): SharedConversationService {
    if (!SharedConversationService.instance) {
      SharedConversationService.instance = new SharedConversationService();
    }
    return SharedConversationService.instance;
  }

  /**
   * Safely parse JSON response with proper error handling
   */
  private async safeJsonParse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      logger.error(`Expected JSON but got ${contentType}`, {
        status: response.status,
        url: response.url,
        responsePreview: responseText.substring(0, 500)
      });

      throw new Error(`Server error: Expected JSON response but received ${contentType || 'unknown content type'}. Status: ${response.status}`);
    }

    try {
      return await response.json();
    } catch (parseError) {
      const responseText = await response.text();
      logger.error(`Failed to parse JSON response`, {
        parseError: parseError instanceof Error ? parseError.message : parseError,
        status: response.status,
        url: response.url,
        responsePreview: responseText.substring(0, 500)
      });

      throw new Error(`Failed to parse server response as JSON. Status: ${response.status}`);
    }
  }

  /**
   * Retry a fetch request with exponential backoff
   */
  private async retryFetch(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${maxRetries} for ${url}`);
        const response = await fetch(url, options);

        // If we get a rate limit error (429), retry with longer delay
        if (response.status === 429 && attempt < maxRetries) {
          const retryDelay = Math.min(5000, Math.pow(2, attempt) * 1000); // Cap at 5 seconds
          logger.warn(`Rate limited, retrying in ${retryDelay}ms`, { attempt, url });
          await this.delay(retryDelay);
          continue;
        }

        // If we get a server error (5xx), retry
        if (response.status >= 500 && attempt < maxRetries) {
          logger.warn(`Server error ${response.status}, retrying...`, { attempt, url });
          await this.delay(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
          continue;
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Attempt ${attempt} failed`, { error: lastError.message, url });

        if (attempt < maxRetries) {
          await this.delay(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
        }
      }
    }

    throw lastError!;
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Share a conversation (create a new shared conversation)
   */
  async shareConversation(request: ShareConversationRequest, ownerId?: string): Promise<ShareConversationResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add user identification for ownership tracking
      if (ownerId) {
        headers['x-user-id'] = ownerId;
      }

      console.log(`[Service] Sharing conversation to: ${this.baseUrl}/api/conversations/share`);

      const response = await this.retryFetch(`${this.baseUrl}/api/conversations/share`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      console.log(`[Service] Response status: ${response.status}`);
      const data = await this.safeJsonParse(response);

      if (!response.ok) {
        let errorMsg = data.error || `HTTP ${response.status}: Failed to share conversation`;

        // Handle rate limiting specifically
        if (response.status === 429) {
          errorMsg = data.error || 'Too many requests. Please wait a moment and try again.';
          logger.warn('Rate limit exceeded', { status: response.status, url: response.url });
        } else {
          logger.error('API error', { status: response.status, error: errorMsg, url: response.url });
        }

        throw new Error(errorMsg);
      }

      if (!data.success) {
        const errorMsg = data.error || 'API returned success: false';
        console.error(`[Service] API returned failure:`, errorMsg);
        throw new Error(errorMsg);
      }

      console.log(`[Service] Successfully shared conversation: ${data.shareId}`);

      // If successful, we could optionally cache the conversation immediately
      // but we'll let it be cached when someone first views it

      return {
        success: true,
        shareId: data.shareId,
        shareUrl: data.shareUrl,
        unshareUrl: data.unshareUrl
      };
    } catch (error) {
      console.error('Error sharing conversation:', error);

      // Provide more detailed error information
      let errorMessage = 'Failed to share conversation';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get a shared conversation (with caching)
   */
  async getSharedConversation(shareId: string, forceRefresh: boolean = false): Promise<GetConversationResponse> {
    try {
      // Check cache first (unless force refresh is requested)
      if (!forceRefresh) {
        const cachedConversation = sharedConversationCache.get(shareId);
        if (cachedConversation) {
          console.log(`[Service] Retrieved conversation ${shareId} from cache`);
          return {
            success: true,
            conversation: cachedConversation
          };
        }
      }

      // Fetch from server
      console.log(`[Service] Fetching conversation ${shareId} from server`);
      const response = await fetch(`${this.baseUrl}/api/conversations/shared/${shareId}`);
      console.log(`[Service] Response status: ${response.status}`);
      const data = await this.safeJsonParse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load conversation');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to load conversation');
      }

      const conversation = data.conversation;

      // Cache the conversation
      // Use a longer TTL for shared conversations since they don't change often
      const cacheTTL = 60 * 60 * 1000; // 1 hour
      sharedConversationCache.set(shareId, conversation, cacheTTL);

      console.log(`[Service] Fetched and cached conversation ${shareId}`);

      return {
        success: true,
        conversation
      };
    } catch (error) {
      console.error('Error fetching shared conversation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load conversation'
      };
    }
  }

  /**
   * Prefetch and cache multiple conversations
   */
  async prefetchConversations(shareIds: string[]): Promise<void> {
    console.log(`[Service] Prefetching ${shareIds.length} conversations`);
    
    const promises = shareIds.map(async (shareId) => {
      // Only fetch if not already cached
      if (!sharedConversationCache.has(shareId)) {
        try {
          await this.getSharedConversation(shareId);
        } catch (error) {
          console.warn(`Failed to prefetch conversation ${shareId}:`, error);
        }
      }
    });

    await Promise.allSettled(promises);
    console.log(`[Service] Prefetch completed`);
  }

  /**
   * Invalidate cache for a specific conversation
   */
  invalidateConversation(shareId: string): void {
    sharedConversationCache.delete(shareId);
    console.log(`[Service] Invalidated cache for conversation ${shareId}`);
  }

  /**
   * Clear all cached conversations
   */
  clearCache(): void {
    sharedConversationCache.clear();
    console.log('[Service] Cleared all cached conversations');
  }

  /**
   * Get cache statistics from server
   */
  async getCacheStats() {
    try {
      const response = await fetch(`${this.baseUrl}/api/conversations/cache/stats`);
      const data = await this.safeJsonParse(response);

      if (data.success) {
        return data.stats;
      } else {
        console.warn('Failed to get cache stats:', data.error);
        return this.getLocalCacheStats();
      }
    } catch (error) {
      console.warn('Error fetching server cache stats, using local:', error);
      return this.getLocalCacheStats();
    }
  }

  /**
   * Get local cache statistics as fallback
   */
  private getLocalCacheStats() {
    return sharedConversationCache.getStats();
  }

  /**
   * Get cache health from server
   */
  async getCacheHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/conversations/cache/health`);
      const data = await this.safeJsonParse(response);

      if (data.success) {
        return data.health;
      } else {
        return { status: 'unhealthy', error: data.error };
      }
    } catch (error) {
      return { status: 'unhealthy', error: 'Failed to check cache health' };
    }
  }

  /**
   * Clear server cache
   */
  async clearServerCache() {
    try {
      const response = await fetch(`${this.baseUrl}/api/conversations/cache/clear`, {
        method: 'DELETE'
      });
      const data = await this.safeJsonParse(response);

      return data.success;
    } catch (error) {
      console.error('Error clearing server cache:', error);
      return false;
    }
  }

  /**
   * Configure cache settings
   */
  configureCaching(options: { maxSize?: number; defaultTTL?: number }): void {
    sharedConversationCache.configure(options);
  }

  /**
   * Warm up cache with popular conversations
   * This could be called on app startup with a list of frequently accessed conversations
   */
  async warmUpCache(popularShareIds: string[]): Promise<void> {
    console.log(`[Service] Warming up cache with ${popularShareIds.length} popular conversations`);
    await this.prefetchConversations(popularShareIds);
  }

  /**
   * Get conversation from cache only (no network request)
   */
  getCachedConversation(shareId: string): SharedConversationData | null {
    return sharedConversationCache.get(shareId);
  }

  /**
   * Check if conversation is cached
   */
  isConversationCached(shareId: string): boolean {
    return sharedConversationCache.has(shareId);
  }

  /**
   * Preload conversation data into cache
   */
  preloadConversation(shareId: string, data: SharedConversationData, ttl?: number): void {
    sharedConversationCache.set(shareId, data, ttl);
  }

  /**
   * Get all cached conversation IDs
   */
  getCachedConversationIds(): string[] {
    return sharedConversationCache.getCachedIds();
  }

  /**
   * Unshare a conversation
   */
  async unshareConversation(shareId: string, ownerId?: string, accessCode?: string): Promise<UnshareConversationResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (ownerId) {
        headers['x-user-id'] = ownerId;
      }
      if (accessCode) {
        headers['x-access-code'] = accessCode;
      }

      const response = await fetch(`${this.baseUrl}/api/conversations/unshare/${shareId}`, {
        method: 'DELETE',
        headers
      });

      const data = await this.safeJsonParse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unshare conversation');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to unshare conversation');
      }

      // Remove from cache if it exists
      this.invalidateConversation(shareId);

      return {
        success: true,
        message: data.message
      };
    } catch (error) {
      console.error('Error unsharing conversation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unshare conversation'
      };
    }
  }

  /**
   * Get conversations owned by the user
   */
  async getOwnedConversations(ownerId?: string, accessCode?: string): Promise<{ success: boolean; conversations?: OwnedConversation[]; error?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (ownerId) {
        headers['x-user-id'] = ownerId;
      }
      if (accessCode) {
        headers['x-access-code'] = accessCode;
      }

      const response = await fetch(`${this.baseUrl}/api/conversations/owned`, {
        method: 'GET',
        headers
      });

      const data = await this.safeJsonParse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch owned conversations');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch owned conversations');
      }

      return {
        success: true,
        conversations: data.conversations
      };
    } catch (error) {
      console.error('Error fetching owned conversations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch owned conversations'
      };
    }
  }

  /**
   * Batch unshare multiple conversations
   */
  async batchUnshareConversations(shareIds: string[], ownerId?: string, accessCode?: string): Promise<{ success: boolean; successful?: number; failed?: number; error?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (ownerId) {
        headers['x-user-id'] = ownerId;
      }
      if (accessCode) {
        headers['x-access-code'] = accessCode;
      }

      const response = await fetch(`${this.baseUrl}/api/conversations/unshare/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ shareIds })
      });

      const data = await this.safeJsonParse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to batch unshare conversations');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to batch unshare conversations');
      }

      // Remove from cache
      shareIds.forEach(shareId => this.invalidateConversation(shareId));

      return {
        success: true,
        successful: data.successful,
        failed: data.failed
      };
    } catch (error) {
      console.error('Error batch unsharing conversations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to batch unshare conversations'
      };
    }
  }
}

// Export singleton instance
export const sharedConversationService = SharedConversationService.getInstance();

// Export types
export type {
  ShareConversationRequest,
  ShareConversationResponse,
  GetConversationResponse,
  UnshareConversationResponse,
  OwnedConversation
};
export default SharedConversationService;
