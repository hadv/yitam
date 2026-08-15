import { DirectAnthropicAdapter } from '../services/DirectAnthropicAdapter';
import { MCPTransportAdapter, StreamingMcpClient } from '../services/MCPTransportAdapter';
import { ContentSafetyPolicy, SafetyChecks } from '../services/ContentSafetyPolicy';
import { ContextMessage } from '../services/ChatTurnOrchestrator';

const collect = async (stream: AsyncIterableIterator<string>): Promise<string[]> => {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
};

describe('DirectAnthropicAdapter', () => {
  const streamOf = (events: any[]) => ({
    messages: {
      stream: jest.fn().mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          for (const event of events) yield event;
        },
      }),
    },
  });

  const textDelta = (text: string) => ({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  });

  it('yields the assistant text and nothing else', async () => {
    const anthropic = streamOf([
      { type: 'message_start' },
      { type: 'content_block_start' },
      textDelta('Huyệt '),
      { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'đang nghĩ' } },
      textDelta('đạo'),
      { type: 'content_block_stop' },
    ]);

    const adapter = new DirectAnthropicAdapter(anthropic as any, { model: 'm', maxTokens: 100 });

    expect(await collect(adapter.streamResponse('Hỏi', []))).toEqual(['Huyệt ', 'đạo']);
  });

  it('sends the context as the transcript, and its system entries as the prompt', async () => {
    const anthropic = streamOf([textDelta('ừ')]);
    const adapter = new DirectAnthropicAdapter(anthropic as any, { model: 'm', maxTokens: 100 });
    const context: ContextMessage[] = [
      { role: 'system', content: 'bối cảnh' },
      { role: 'user', content: 'câu trước' },
      { role: 'assistant', content: '   ' },
      { role: 'assistant', content: 'trả lời trước' },
    ];

    await collect(adapter.streamResponse('câu mới', context));

    expect(anthropic.messages.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'bối cảnh',
        messages: [
          { role: 'user', content: 'câu trước' },
          { role: 'assistant', content: 'trả lời trước' },
        ],
      })
    );
  });

  it('falls back to the message itself when the context is empty', async () => {
    const anthropic = streamOf([textDelta('ừ')]);
    const adapter = new DirectAnthropicAdapter(anthropic as any, { model: 'm', maxTokens: 100 });

    await collect(adapter.streamResponse('câu mới', [{ role: 'system', content: 'chỉ có system' }]));

    expect(anthropic.messages.stream).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: 'câu mới' }] })
    );
  });
});

describe('MCPTransportAdapter', () => {
  /** An MCP client that pushes the given chunks, one per callback call. */
  const clientPushing = (chunks: string[]): StreamingMcpClient => ({
    async processQueryWithStreaming(_query, streamCallback) {
      for (const chunk of chunks) {
        if ((await streamCallback(chunk)) === false) return;
      }
    },
  });

  it('turns callback pushes into an iterator, in order', async () => {
    const adapter = new MCPTransportAdapter(clientPushing(['một', ' hai', ' ba']), 'chat-1');

    expect(await collect(adapter.streamResponse('hỏi', []))).toEqual(['một', ' hai', ' ba']);
  });

  it('passes the chat id, persona and transcript through', async () => {
    const client: StreamingMcpClient = { processQueryWithStreaming: jest.fn().mockResolvedValue(undefined) };
    const adapter = new MCPTransportAdapter(client, 'chat-7');

    await collect(
      adapter.streamResponse('hỏi', [
        { role: 'system', content: 'bỏ qua' },
        { role: 'user', content: 'câu trước' },
      ], 'lan-ong')
    );

    expect(client.processQueryWithStreaming).toHaveBeenCalledWith(
      'hỏi',
      expect.any(Function),
      'chat-7',
      'lan-ong',
      [{ role: 'user', content: 'câu trước' }]
    );
  });

  it('passes no transcript at all when the context holds nothing usable', async () => {
    const client: StreamingMcpClient = { processQueryWithStreaming: jest.fn().mockResolvedValue(undefined) };
    const adapter = new MCPTransportAdapter(client, 'chat-7');

    await collect(adapter.streamResponse('hỏi', []));

    expect(client.processQueryWithStreaming).toHaveBeenCalledWith(
      'hỏi',
      expect.any(Function),
      'chat-7',
      undefined,
      undefined
    );
  });

  it('tells the client to stop when the consumer stops reading', async () => {
    // The client has to still be producing when the consumer walks away, so it
    // yields to the event loop between chunks. A client that pushed everything in
    // one go would finish before the break and never be asked to stop — which is
    // what an earlier version of this test proved, and nothing else.
    let sawStop = false;
    let finished!: Promise<void>;
    const client: StreamingMcpClient = {
      processQueryWithStreaming(_query, streamCallback) {
        finished = (async () => {
          for (const chunk of ['một', ' hai', ' ba']) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if ((await streamCallback(chunk)) === false) {
              sawStop = true;
              return;
            }
          }
        })();
        return finished;
      },
    };
    const adapter = new MCPTransportAdapter(client, 'chat-1');

    const taken: string[] = [];
    for await (const chunk of adapter.streamResponse('hỏi', [])) {
      taken.push(chunk);
      if (taken.length === 2) break;
    }
    await finished;

    expect(taken).toEqual(['một', ' hai']);
    expect(sawStop).toBe(true);
  });

  it('surfaces a failure from the client', async () => {
    const client: StreamingMcpClient = {
      processQueryWithStreaming: jest.fn().mockRejectedValue(new Error('mcp sập')),
    };
    const adapter = new MCPTransportAdapter(client, 'chat-1');

    await expect(collect(adapter.streamResponse('hỏi', []))).rejects.toThrow('mcp sập');
  });

  it('yields what arrived before a failure', async () => {
    const client: StreamingMcpClient = {
      async processQueryWithStreaming(_query, streamCallback) {
        await streamCallback('một nửa');
        throw new Error('đứt giữa chừng');
      },
    };
    const adapter = new MCPTransportAdapter(client, 'chat-1');

    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of adapter.streamResponse('hỏi', [])) seen.push(chunk);
      })()
    ).rejects.toThrow('đứt giữa chừng');
    expect(seen).toEqual(['một nửa']);
  });
});

describe('ContentSafetyPolicy', () => {
  const service: jest.Mocked<SafetyChecks> = {
    validateContent: jest.fn().mockResolvedValue(undefined),
    sanitizeContent: jest.fn().mockReturnValue('sạch'),
    validateResponse: jest.fn().mockResolvedValue(undefined),
    checkPromptInjectionOnly: jest.fn().mockReturnValue(true),
  };

  it('passes each check to the service, language included', async () => {
    const policy = new ContentSafetyPolicy(service);

    await policy.validateContent('thô');
    await policy.validateResponse('trả lời', 'vi');

    expect(policy.sanitizeContent('thô')).toBe('sạch');
    expect(policy.checkPromptInjectionOnly('trả lời', 'en')).toBe(true);
    expect(service.validateContent).toHaveBeenCalledWith('thô');
    expect(service.validateResponse).toHaveBeenCalledWith('trả lời', 'vi');
    expect(service.checkPromptInjectionOnly).toHaveBeenCalledWith('trả lời', 'en');
  });

  it('lets a safety verdict through untouched', async () => {
    const verdict = Object.assign(new Error('không hợp lệ'), { code: 'prompt_injection' });
    service.validateContent.mockRejectedValueOnce(verdict);

    await expect(new ContentSafetyPolicy(service).validateContent('xấu')).rejects.toBe(verdict);
  });
});
