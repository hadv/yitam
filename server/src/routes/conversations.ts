import { Router, Request, Response } from 'express';
import { SharedConversationService } from '../services/SharedConversationService';
import { ShareConversationRequest } from '../db/database';

const router = Router();
const sharedConversationService = SharedConversationService.getInstance();

// Share a conversation
router.post('/share', async (req: Request, res: Response): Promise<void> => {
  try {
    const shareRequest: ShareConversationRequest = req.body;
    
    // Validate required fields
    if (!shareRequest.title || !shareRequest.messages || !Array.isArray(shareRequest.messages)) {
      res.status(400).json({
        success: false,
        error: 'Title and messages are required'
      });
      return;
    }

    // Validate messages format
    for (const message of shareRequest.messages) {
      if (!message.id || !message.role || !message.content || !message.timestamp) {
        res.status(400).json({
          success: false,
          error: 'Invalid message format'
        });
        return;
      }
      
      if (!['user', 'assistant'].includes(message.role)) {
        res.status(400).json({
          success: false,
          error: 'Invalid message role'
        });
        return;
      }
    }

    // Limit conversation size (prevent abuse)
    const maxMessages = 100;
    if (shareRequest.messages.length > maxMessages) {
      res.status(400).json({
        success: false,
        error: `Conversation too long. Maximum ${maxMessages} messages allowed.`
      });
      return;
    }

    // Limit title length
    if (shareRequest.title.length > 200) {
      res.status(400).json({
        success: false,
        error: 'Title too long. Maximum 200 characters allowed.'
      });
      return;
    }

    // Add ownership tracking
    const ownershipData = {
      ...shareRequest,
      owner_id: req.headers['x-user-id'] as string || undefined,
      access_code: req.headers['x-access-code'] as string || undefined
    };

    // Create shared conversation
    const shareId = await sharedConversationService.createSharedConversation(ownershipData);

    res.json({
      success: true,
      shareId,
      shareUrl: `${req.protocol}://${req.get('host')}/shared/${shareId}`,
      unshareUrl: `${req.protocol}://${req.get('host')}/api/conversations/unshare/${shareId}`
    });

  } catch (error) {
    console.error('Error sharing conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get a shared conversation
router.get('/shared/:shareId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;
    
    if (!shareId) {
      res.status(400).json({
        success: false,
        error: 'Share ID is required'
      });
      return;
    }

    const conversation = await sharedConversationService.getSharedConversation(shareId);
    
    if (!conversation) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found or has expired'
      });
      return;
    }

    // Parse messages
    let messages;
    try {
      messages = JSON.parse(conversation.messages);
    } catch (error) {
      console.error('Error parsing conversation messages:', error);
      res.status(500).json({
        success: false,
        error: 'Invalid conversation data'
      });
      return;
    }

    // Get conversation stats
    const stats = await sharedConversationService.getConversationStats(shareId);

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages,
        persona_id: conversation.persona_id,
        created_at: conversation.created_at,
        view_count: conversation.view_count,
        stats
      }
    });

  } catch (error) {
    console.error('Error fetching shared conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get conversation stats (optional endpoint for analytics)
router.get('/shared/:shareId/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;
    
    const stats = await sharedConversationService.getConversationStats(shareId);
    
    if (!stats) {
      res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
      return;
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching conversation stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Unshare a conversation
router.delete('/unshare/:shareId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;

    if (!shareId) {
      res.status(400).json({
        success: false,
        error: 'Share ID is required'
      });
      return;
    }

    // Get ownership credentials
    const ownerId = req.headers['x-user-id'] as string;
    const accessCode = req.headers['x-access-code'] as string;

    if (!ownerId && !accessCode) {
      res.status(401).json({
        success: false,
        error: 'Owner ID or access code required'
      });
      return;
    }

    const success = await sharedConversationService.unshareConversation(shareId, ownerId, accessCode);

    if (success) {
      res.json({
        success: true,
        message: 'Conversation unshared successfully'
      });
    } else {
      res.status(403).json({
        success: false,
        error: 'Unauthorized or conversation not found'
      });
    }

  } catch (error) {
    console.error('Error unsharing conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get owned conversations
router.get('/owned', async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = req.headers['x-user-id'] as string;
    const accessCode = req.headers['x-access-code'] as string;

    if (!ownerId && !accessCode) {
      res.status(401).json({
        success: false,
        error: 'Owner ID or access code required'
      });
      return;
    }

    const conversations = await sharedConversationService.getOwnedConversations(ownerId, accessCode);

    res.json({
      success: true,
      conversations
    });

  } catch (error) {
    console.error('Error fetching owned conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Batch unshare conversations
router.post('/unshare/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareIds } = req.body;

    if (!Array.isArray(shareIds) || shareIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Share IDs array is required'
      });
      return;
    }

    const ownerId = req.headers['x-user-id'] as string;
    const accessCode = req.headers['x-access-code'] as string;

    if (!ownerId && !accessCode) {
      res.status(401).json({
        success: false,
        error: 'Owner ID or access code required'
      });
      return;
    }

    const results = await Promise.allSettled(
      shareIds.map(shareId =>
        sharedConversationService.unshareConversation(shareId, ownerId, accessCode)
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = results.length - successful;

    res.json({
      success: true,
      message: `${successful} conversations unshared successfully, ${failed} failed`,
      successful,
      failed
    });

  } catch (error) {
    console.error('Error batch unsharing conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
