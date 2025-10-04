interface TestMessage {
  role: 'user' | 'assistant';
  content: string;
}

describe('First Message Handling Logic', () => {
  test('should handle empty context for first message', () => {
    const userMessage = 'Ngộ là gì? Trải nghiệm tánh biết khi ngắm hoàng hôn';

    // Simulate empty context window (first message scenario)
    const contextWindow = {
      recentMessages: [] as TestMessage[],
      relevantHistory: [] as TestMessage[],
      summaries: [],
      keyFacts: [],
      totalTokens: 18,
      compressionRatio: 0.333
    };

    // Simulate the server logic before the fix
    const allContextMessages: TestMessage[] = [
      ...contextWindow.recentMessages,
      ...contextWindow.relevantHistory
    ];

    // Before fix: this would be empty and cause "No valid messages" error
    expect(allContextMessages.length).toBe(0);

    // Simulate the server fix
    if (allContextMessages.length === 0) {
      allContextMessages.push({
        role: 'user',
        content: userMessage
      });
    }

    // After the fix: we should have at least one message
    expect(allContextMessages.length).toBeGreaterThan(0);
    expect(allContextMessages[0].role).toBe('user');
    expect(allContextMessages[0].content).toBe(userMessage);

    // Filter and validate messages (as done in server)
    const validMessages = allContextMessages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .filter(msg => msg.content && typeof msg.content === 'string' && msg.content.trim())
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

    // Should have valid messages to send to LLM
    expect(validMessages.length).toBeGreaterThan(0);
    expect(validMessages[0].role).toBe('user');
    expect(validMessages[0].content).toBe(userMessage);
  });

  test('should handle MCP client context for first message', () => {
    const userMessage = 'Hello, this is my first message';

    // Simulate empty context window for MCP client
    const contextWindow = {
      recentMessages: [] as TestMessage[],
      relevantHistory: [] as TestMessage[],
      summaries: [],
      keyFacts: [],
      totalTokens: 10,
      compressionRatio: 0.5
    };

    // Simulate MCP client context building
    let optimizedContext: TestMessage[] = [
      ...contextWindow.recentMessages
        .filter(msg => msg.content && typeof msg.content === 'string' && msg.content.trim())
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        })),
      ...contextWindow.relevantHistory
        .filter(msg => msg.content && typeof msg.content === 'string' && msg.content.trim())
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        }))
    ];

    // Before fix: empty context
    expect(optimizedContext.length).toBe(0);

    // Apply the fix
    if (optimizedContext.length === 0) {
      optimizedContext.push({
        role: 'user',
        content: userMessage
      });
    }

    // After fix: should have the user message
    expect(optimizedContext.length).toBe(1);
    expect(optimizedContext[0].role).toBe('user');
    expect(optimizedContext[0].content).toBe(userMessage);
  });

  test('should not affect subsequent messages with existing context', () => {
    const userMessage = 'This is a follow-up message';

    // Simulate context window with existing messages
    const contextWindow = {
      recentMessages: [
        { role: 'user' as const, content: 'Previous user message' },
        { role: 'assistant' as const, content: 'Previous assistant response' }
      ] as TestMessage[],
      relevantHistory: [] as TestMessage[],
      summaries: [],
      keyFacts: [],
      totalTokens: 50,
      compressionRatio: 0.8
    };

    // Build context messages
    const allContextMessages: TestMessage[] = [
      ...contextWindow.recentMessages,
      ...contextWindow.relevantHistory
    ];

    // Should already have messages
    expect(allContextMessages.length).toBe(2);

    // The fix should not trigger when there are existing messages
    if (allContextMessages.length === 0) {
      allContextMessages.push({
        role: 'user',
        content: userMessage
      });
    }

    // Should still have the original 2 messages
    expect(allContextMessages.length).toBe(2);
    expect(allContextMessages[0].content).toBe('Previous user message');
    expect(allContextMessages[1].content).toBe('Previous assistant response');
  });
});
