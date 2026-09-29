import { Query } from '../services/Query';
import { Conversation } from '../services/Conversation';
import type { MCPServer } from '../services/MCPServer';
import type { Tool } from '../services/Tool';
import { ModelRefusalError } from '../utils/errors';

// Stream events as messages.stream() yields them, cut down to the fields Query
// reads.
const text = (t: string) => [
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
];

const toolCall = [
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'toolu_1', name: 'search', input: {} },
  },
];

const end = (stopReason: string, category: string | null = null) => [
  {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason,
      stop_details:
        stopReason === 'refusal' ? { type: 'refusal', category, explanation: null } : null,
    },
  },
  { type: 'message_stop' },
];

describe('Query.processQueryWithStreaming', () => {
  const QUERY = 'Châm cứu huyệt Hợp Cốc có tác dụng gì?';

  let conversation: Conversation;
  let stream: jest.Mock;
  let query: Query;

  // Each call to messages.stream() plays the next script, in order.
  const setup = (...scripts: unknown[][]) => {
    conversation = new Conversation();
    stream = jest.fn();
    for (const events of scripts) {
      stream.mockImplementationOnce(() => (async function* () { yield* events; })());
    }

    const tool = {
      getTools: () => [
        { name: 'search', description: 'Tìm kiếm', input_schema: { type: 'object', properties: {} } },
      ],
      enrichToolArguments: (_name: string, args: Record<string, unknown>) => ({ ...args }),
      formatToolCall: () => '<tool-call/>',
    } as unknown as Tool;
    const mcpServer = {
      callTool: jest.fn().mockResolvedValue({ content: 'kết quả tìm kiếm' }),
    } as unknown as MCPServer;

    query = new Query('test-key', conversation, mcpServer, tool);
    // The constructor builds real clients into private fields, so the stubs are
    // assigned through a cast. create() answers the search-query and domain
    // extraction calls; stream() plays the replies under test.
    Object.assign(query as unknown as Record<string, unknown>, {
      anthropic: {
        messages: {
          create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'đông y' }] }),
          stream,
        },
      },
      moderationService: {
        moderateContent: jest.fn().mockResolvedValue({ isSafe: true, categories: {} }),
      },
    });
  };

  beforeEach(() => {
    for (const method of ['log', 'warn', 'error', 'time', 'timeEnd'] as const) {
      jest.spyOn(console, method).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('completes a reply that ends normally', async () => {
    // Counterpart to the refusal tests: the check must not disturb this path.
    setup([...text('Hợp Cốc chủ trị đau đầu.'), ...end('end_turn')]);

    await expect(query.processQueryWithStreaming(QUERY, jest.fn(() => true))).resolves.toBeUndefined();
    expect(conversation.getConversationHistory()).toContainEqual({
      role: 'assistant',
      content: 'Hợp Cốc chủ trị đau đầu.',
    });
  });

  it('fails the reply, and keeps none of it, when the first response is declined', async () => {
    setup([...text('Về huyệt này'), ...end('refusal', 'bio')]);
    const callback = jest.fn(() => true);

    const error = await query.processQueryWithStreaming(QUERY, callback).catch((e) => e);

    expect(error).toBeInstanceOf(ModelRefusalError);
    expect(error.category).toBe('bio');
    // The text streamed before the refusal is not stored as the assistant's turn.
    expect(conversation.getConversationHistory()).toEqual([{ role: 'user', content: QUERY }]);
    // Nor is the refusal turned into a general error chunk on the way out, which
    // is what the catch blocks in processQueryWithStreaming do to other errors.
    expect(callback).not.toHaveBeenCalledWith(expect.stringContaining('"type":"other"'));
  });

  it('fails the reply without retrying when the follow-up after a tool call is declined', async () => {
    // Takes about 2s: Query waits before sending the follow-up request.
    setup([...toolCall, ...end('tool_use')], [...text('Theo tài liệu'), ...end('refusal', 'bio')]);

    const error = await query.processQueryWithStreaming(QUERY, jest.fn(() => true)).catch((e) => e);

    expect(error).toBeInstanceOf(ModelRefusalError);
    // One reply and one follow-up. The follow-up's retry loop is for streams that
    // stall or cut off; a retry would ask the same model the same thing.
    expect(stream).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(conversation.getConversationHistory())).not.toContain('Theo tài liệu');
  });
});
