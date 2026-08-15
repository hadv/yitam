import { ChatError, ChatTurnOrchestrator, ContextMessage, ContextProvider, SafetyPolicy, TransportAdapter } from './ChatTurnOrchestrator';

export type Language = 'en' | 'vi';

/** The `ERROR_MESSAGES` table, as this module needs to see it. */
export type ErrorMessageTable = Record<string, Record<Language, string>>;

/** What the dispatcher sends back to one client. */
export interface ChatTurnEmitter {
  emit(event: string, payload: unknown): void;
}

export interface ChatTurnRequest {
  input: string;
  chatId: string;
  personaId?: string;
  messageId: string;
  context: ContextMessage[] | ContextProvider;
}

export interface ChatTurnDispatcherOptions {
  orchestrator: ChatTurnOrchestrator;
  safetyPolicy: SafetyPolicy;
  errorMessages: ErrorMessageTable;
  enableAiSafety: boolean;
  language?: Language;
  /** Called once a turn has produced its whole reply. */
  onCompleted?: (fullResponse: string, responseTimeMs: number) => Promise<void> | void;
}

/**
 * The edge between a chat turn and one socket.
 *
 * `ChatTurnOrchestrator` decides what happened and says so in typed events; this
 * turns those into the socket protocol the client speaks, and into Vietnamese.
 * Keeping the translation here is deliberate: the orchestrator should not know
 * what a socket is, or what language this user reads.
 */
export class ChatTurnDispatcher {
  constructor(private readonly options: ChatTurnDispatcherOptions) {}

  /**
   * Run one turn and report it to `emitter`.
   *
   * Every error leaves over `bot-response-error`, which carries a message the
   * client displays on the pending reply. The handler this replaces used three
   * different events for three kinds of failure, and two of them — `bot-response`
   * for a rejected input, `tool-call-timeout` — are events no client listens for,
   * so those failures reached the user as silence.
   */
  async run(
    emitter: ChatTurnEmitter,
    request: ChatTurnRequest,
    transport: TransportAdapter
  ): Promise<void> {
    const language = this.options.language ?? 'vi';

    emitter.emit('bot-response-start', { id: request.messageId });

    const events = this.options.orchestrator.streamTurn({
      input: request.input,
      chatId: request.chatId,
      personaId: request.personaId,
      context: request.context,
      safetyPolicy: this.options.safetyPolicy,
      transport,
      enableAiSafety: this.options.enableAiSafety,
      language,
    });

    for await (const event of events) {
      if (event.type === 'chunk') {
        emitter.emit('bot-response-chunk', { id: request.messageId, text: event.text });
        continue;
      }

      if (event.type === 'error') {
        // A safety verdict knows which language it judged; everything else speaks
        // the language of the request.
        const spoken = this.languageOf(event.error) ?? language;

        emitter.emit('bot-response-error', {
          id: request.messageId,
          error: {
            type: this.errorType(event.error),
            error: { message: this.messageFor(event.error, spoken) },
          },
        });
        return;
      }

      if (this.options.onCompleted) {
        try {
          await this.options.onCompleted(event.fullResponse, event.responseTimeMs);
        } catch (error) {
          // Remembering the turn is not worth failing it over.
          console.error('[CHAT] Error in turn completion hook:', error);
        }
      }

      emitter.emit('bot-response-end', {
        id: request.messageId,
        text: event.fullResponse,
        responseTime: event.responseTimeMs,
      });
    }
  }

  private languageOf(error: ChatError): Language | null {
    const language = (error as { language?: string }).language;
    return language === 'en' || language === 'vi' ? language : null;
  }

  /** The wire name for an error. `rate_limit_error` is the one the client tests for. */
  private errorType(error: ChatError): string {
    return error.type === 'rate_limit' ? 'rate_limit_error' : error.type;
  }

  private messageFor(error: ChatError, language: Language): string {
    const table = this.options.errorMessages;
    const say = (key: string) => table[key]?.[language] ?? table.general_error[language];

    switch (error.type) {
      case 'restricted_content':
        // Only some verdicts have a message of their own; the rest are "invalid".
        return ['medical_advice', 'financial_advice', 'legal_advice', 'product_marketing'].includes(error.code)
          ? say('restricted_content')
          : say('invalid_content');
      case 'prompt_injection':
        return say('prompt_injection');
      case 'rate_limit':
        return say('rate_limit');
      case 'overloaded':
        return say('overloaded');
      case 'credit_balance':
        return say('credit_balance');
      case 'bad_request':
        return say('bad_request');
      case 'auth':
        return say('auth_error');
      default:
        return say('general_error');
    }
  }

}
