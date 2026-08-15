import { ChatTurnDispatcher, ChatTurnEmitter, ErrorMessageTable } from '../services/ChatTurnDispatcher';
import { ChatTurnOrchestrator, SafetyPolicy, TransportAdapter } from '../services/ChatTurnOrchestrator';
import { ContentSafetyError } from '../utils/errors';

const ERROR_MESSAGES: ErrorMessageTable = {
  restricted_content: { en: 'restricted', vi: 'nội dung bị hạn chế' },
  invalid_content: { en: 'invalid', vi: 'nội dung không hợp lệ' },
  prompt_injection: { en: 'injection', vi: 'phải dừng lại' },
  general_error: { en: 'general', vi: 'đã xảy ra lỗi' },
  overloaded: { en: 'overloaded', vi: 'hệ thống đang tải cao' },
  rate_limit: { en: 'rate limit', vi: 'vượt quá giới hạn' },
  auth_error: { en: 'auth', vi: 'lỗi xác thực' },
  bad_request: { en: 'bad request', vi: 'yêu cầu không hợp lệ' },
  credit_balance: { en: 'credits', vi: 'số dư tín dụng quá thấp' },
};

const permissivePolicy = (): SafetyPolicy => ({
  validateContent: jest.fn().mockResolvedValue(undefined),
  sanitizeContent: jest.fn().mockImplementation((message: string) => message),
  validateResponse: jest.fn().mockResolvedValue(undefined),
  checkPromptInjectionOnly: jest.fn().mockReturnValue(true),
});

const transportYielding = (...chunks: string[]): TransportAdapter => ({
  streamResponse: () =>
    (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
});

const transportFailing = (error: unknown): TransportAdapter => ({
  streamResponse: () =>
    (async function* () {
      throw error;
      // eslint-disable-next-line no-unreachable
      yield '';
    })(),
});

const recordingEmitter = () => {
  const sent: Array<{ event: string; payload: any }> = [];
  const emitter: ChatTurnEmitter = { emit: (event, payload) => void sent.push({ event, payload }) };
  return { emitter, sent, names: () => sent.map(entry => entry.event) };
};

const request = {
  input: 'Hỏi về huyệt đạo',
  chatId: 'chat-1',
  messageId: 'msg-1',
  context: [],
};

const dispatcherWith = (
  overrides: Partial<ConstructorParameters<typeof ChatTurnDispatcher>[0]> = {}
) =>
  new ChatTurnDispatcher({
    orchestrator: new ChatTurnOrchestrator(),
    safetyPolicy: permissivePolicy(),
    errorMessages: ERROR_MESSAGES,
    enableAiSafety: false,
    language: 'vi',
    ...overrides,
  });

describe('a turn that succeeds', () => {
  it('announces the start, streams the chunks, and ends with the whole reply', async () => {
    const { emitter, sent, names } = recordingEmitter();

    await dispatcherWith().run(emitter, request, transportYielding('Huyệt ', 'đạo'));

    expect(names()).toEqual([
      'bot-response-start',
      'bot-response-chunk',
      'bot-response-chunk',
      'bot-response-end',
    ]);
    expect(sent[1].payload).toEqual({ id: 'msg-1', text: 'Huyệt ' });
    expect(sent[3].payload).toMatchObject({ id: 'msg-1', text: 'Huyệt đạo' });
  });

  it('hands the finished reply to the completion hook before ending the turn', async () => {
    const { emitter, names } = recordingEmitter();
    const onCompleted = jest.fn().mockResolvedValue(undefined);

    await dispatcherWith({ onCompleted }).run(emitter, request, transportYielding('xong'));

    expect(onCompleted).toHaveBeenCalledWith('xong', expect.any(Number));
    expect(names()).toContain('bot-response-end');
  });

  it('still ends the turn when the completion hook throws', async () => {
    const { emitter, names } = recordingEmitter();
    const onCompleted = jest.fn().mockRejectedValue(new Error('context engine sập'));

    await dispatcherWith({ onCompleted }).run(emitter, request, transportYielding('xong'));

    // Remembering the turn is not worth failing it over.
    expect(names()).toContain('bot-response-end');
  });
});

describe('a turn that fails', () => {
  const errorFrom = (sent: Array<{ event: string; payload: any }>) =>
    sent.find(entry => entry.event === 'bot-response-error')?.payload;

  it('reports a rejected input on the pending reply, in Vietnamese', async () => {
    const { emitter, sent, names } = recordingEmitter();
    const safetyPolicy = permissivePolicy();
    (safetyPolicy.validateContent as jest.Mock).mockRejectedValue(
      new ContentSafetyError('y tế', 'medical_advice', 'vi')
    );

    await dispatcherWith({ safetyPolicy }).run(emitter, request, transportYielding('không bao giờ tới'));

    // The handler this replaces sent `bot-response` here, which no client listens
    // for: a rejected message reached the user as silence.
    expect(names()).toEqual(['bot-response-start', 'bot-response-error']);
    expect(errorFrom(sent)).toEqual({
      id: 'msg-1',
      error: { type: 'restricted_content', error: { message: 'nội dung bị hạn chế' } },
    });
  });

  it('calls a safety verdict without a message of its own "invalid"', async () => {
    const { emitter, sent } = recordingEmitter();
    const safetyPolicy = permissivePolicy();
    (safetyPolicy.validateContent as jest.Mock).mockRejectedValue(
      new ContentSafetyError('gì đó', 'something_else', 'vi')
    );

    await dispatcherWith({ safetyPolicy }).run(emitter, request, transportYielding('x'));

    expect(errorFrom(sent).error.error.message).toBe('nội dung không hợp lệ');
  });

  it('keeps the chunks that arrived before a mid-stream verdict', async () => {
    const { emitter, sent, names } = recordingEmitter();
    const safetyPolicy = permissivePolicy();
    (safetyPolicy.checkPromptInjectionOnly as jest.Mock)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    await dispatcherWith({ safetyPolicy }).run(emitter, request, transportYielding('an toàn', ' rồi hỏng'));

    expect(names()).toEqual(['bot-response-start', 'bot-response-chunk', 'bot-response-error']);
    expect(sent[1].payload.text).toBe('an toàn');
    expect(errorFrom(sent).error.error.message).toBe('phải dừng lại');
  });

  it('answers a verdict in the language it was judged in', async () => {
    const { emitter, sent } = recordingEmitter();
    const safetyPolicy = permissivePolicy();
    (safetyPolicy.validateContent as jest.Mock).mockRejectedValue(
      new ContentSafetyError('medical', 'medical_advice', 'en')
    );

    await dispatcherWith({ safetyPolicy }).run(emitter, request, transportYielding('x'));

    expect(errorFrom(sent).error.error.message).toBe('restricted');
  });

  it('treats an unrelated error carrying a code as a failure, not a verdict', async () => {
    const { emitter, sent } = recordingEmitter();
    const notAVerdict = Object.assign(new Error('ổ đĩa đầy'), { code: 'ENOSPC' });

    await dispatcherWith().run(emitter, request, transportFailing(notAVerdict));

    expect(errorFrom(sent).error).toEqual({ type: 'general', error: { message: 'đã xảy ra lỗi' } });
  });

  it('names a rate limit the way the client tests for it', async () => {
    const { emitter, sent } = recordingEmitter();

    await dispatcherWith().run(emitter, request, transportFailing({ status: 429 }));

    expect(errorFrom(sent)).toEqual({
      id: 'msg-1',
      error: { type: 'rate_limit_error', error: { message: 'vượt quá giới hạn' } },
    });
  });

  it.each([
    [{ status: 529 }, 'overloaded', 'hệ thống đang tải cao'],
    [{ status: 400 }, 'bad_request', 'yêu cầu không hợp lệ'],
    [{ status: 401 }, 'auth', 'lỗi xác thực'],
    [new Error('gì đó'), 'general', 'đã xảy ra lỗi'],
  ])('maps a transport failure to its message', async (thrown, type, message) => {
    const { emitter, sent } = recordingEmitter();

    await dispatcherWith().run(emitter, request, transportFailing(thrown));

    expect(errorFrom(sent).error).toEqual({ type, error: { message } });
  });

  it('never ends a turn it has already reported as failed', async () => {
    const { emitter, names } = recordingEmitter();

    await dispatcherWith().run(emitter, request, transportFailing({ status: 529 }));

    expect(names()).not.toContain('bot-response-end');
  });
});
