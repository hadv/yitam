import { SharedConversationService } from '../SharedConversationService';

// Mock fetch globally
global.fetch = jest.fn();

describe('SharedConversationService', () => {
  let service: SharedConversationService;
  
  beforeEach(() => {
    service = SharedConversationService.getInstance();
    jest.clearAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle HTML response instead of JSON', async () => {
      // Mock fetch to return HTML (like a 404 page)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        headers: {
          get: (name: string) => name === 'content-type' ? 'text/html' : null
        },
        text: () => Promise.resolve('<!DOCTYPE html><html><body>Not Found</body></html>')
      });

      const result = await service.shareConversation({
        title: 'Test Conversation',
        messages: [],
        persona_id: 'test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected JSON response but received text/html');
    });

    it('should handle network errors gracefully', async () => {
      // Mock fetch to throw a network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));

      const result = await service.shareConversation({
        title: 'Test Conversation',
        messages: [],
        persona_id: 'test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch');
    });

    it('should handle malformed JSON response', async () => {
      // Mock fetch to return invalid JSON
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null
        },
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
        text: () => Promise.resolve('{"invalid": json}')
      });

      const result = await service.shareConversation({
        title: 'Test Conversation',
        messages: [],
        persona_id: 'test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse server response as JSON');
    });

    it('should handle rate limiting errors gracefully', async () => {
      // Mock fetch to return rate limit error
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null
        },
        json: () => Promise.resolve({
          success: false,
          error: 'Rate limit exceeded. Please try again in a few seconds.',
          code: 'RATE_LIMIT_EXCEEDED'
        })
      });

      const result = await service.shareConversation({
        title: 'Test Conversation',
        messages: [],
        persona_id: 'test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should handle successful response correctly', async () => {
      // Mock fetch to return successful JSON response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null
        },
        json: () => Promise.resolve({
          success: true,
          shareId: 'test-share-id',
          shareUrl: 'https://yitam.org/shared/test-share-id',
          unshareUrl: 'https://yitam.org/api/conversations/unshare/test-share-id'
        })
      });

      const result = await service.shareConversation({
        title: 'Test Conversation',
        messages: [],
        persona_id: 'test'
      });

      expect(result.success).toBe(true);
      expect(result.shareId).toBe('test-share-id');
      expect(result.shareUrl).toBe('https://yitam.org/shared/test-share-id');
    });
  });
});
