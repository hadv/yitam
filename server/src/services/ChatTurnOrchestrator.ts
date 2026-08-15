export type ChatError = 
  | { type: 'restricted_content'; code: string; language?: string }
  | { type: 'prompt_injection'; language?: string }
  | { type: 'rate_limit' }
  | { type: 'overloaded' }
  | { type: 'credit_balance' }
  | { type: 'bad_request' }
  | { type: 'auth' }
  | { type: 'general'; originalError?: unknown };

export interface SafetyPolicy {
  validateContent(message: string): Promise<void>;
  sanitizeContent(message: string): string;
  validateResponse(chunk: string, language: string): Promise<void>;
  checkPromptInjectionOnly(chunk: string, language: string): boolean;
}

export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TransportAdapter {
  streamResponse(
    message: string, 
    context: ContextMessage[], 
    personaId?: string
  ): AsyncIterableIterator<string>;
}

export type StreamEvent = 
  | { type: 'chunk'; text: string }
  | { type: 'error'; error: ChatError }
  | { type: 'end'; fullResponse: string; responseTimeMs: number };

/**
 * Builds the transcript for a turn, given the input as the safety policy left it.
 *
 * A function rather than an array when the context depends on the sanitized text:
 * the caller's context store records the turn and answers with a window around it,
 * and recording the raw input would both store what sanitizing removed and feed it
 * back to the model on the next turn.
 */
export type ContextProvider = (sanitizedInput: string) => Promise<ContextMessage[]> | ContextMessage[];

export interface StreamChatTurnOptions {
  input: string;
  chatId: string;
  personaId?: string;
  context: ContextMessage[] | ContextProvider;
  safetyPolicy: SafetyPolicy;
  transport: TransportAdapter;
  enableAiSafety: boolean;
  language?: string; // e.g. 'vi' or 'en'
}

/**
 * A safety verdict, as opposed to something that merely went wrong.
 *
 * `ContentSafetyError` carries both a `code` and the `language` it was judged in.
 * Insisting on both keeps an unrelated error that happens to have a `code` — an
 * SDK or filesystem error — from being reported to the user as unsafe content.
 */
const asSafetyVerdict = (error: any): { code: string; language?: string } | null =>
  typeof error?.code === 'string' && typeof error?.language === 'string'
    ? { code: error.code, language: error.language }
    : null;

export class ChatTurnOrchestrator {
  async *streamTurn(options: StreamChatTurnOptions): AsyncIterableIterator<StreamEvent> {
    const startTime = Date.now();
    let sanitizedMessage = options.input;
    const language = options.language || 'vi';

    // 1. Initial Content Safety Check
    try {
      await options.safetyPolicy.validateContent(options.input);
      sanitizedMessage = options.safetyPolicy.sanitizeContent(options.input);
    } catch (error: any) {
      if (error?.message?.includes('credit balance is too low')) {
        yield { type: 'error', error: { type: 'credit_balance' } };
        return;
      }
      const verdict = asSafetyVerdict(error);
      if (verdict) {
        yield verdict.code === 'prompt_injection'
          ? { type: 'error', error: { type: 'prompt_injection', language: verdict.language } }
          : { type: 'error', error: { type: 'restricted_content', code: verdict.code, language: verdict.language } };
        return;
      }
      yield { type: 'error', error: { type: 'general', originalError: error } };
      return;
    }

    // 2. Build the context, now that the input is in its final form
    let context: ContextMessage[];
    try {
      context = typeof options.context === 'function'
        ? await options.context(sanitizedMessage)
        : options.context;
    } catch (error: any) {
      yield { type: 'error', error: { type: 'general', originalError: error } };
      return;
    }

    // 3. Stream from Transport Adapter
    let responseBuffer = '';
    let stream: AsyncIterableIterator<string>;

    try {
      stream = options.transport.streamResponse(sanitizedMessage, context, options.personaId);
    } catch (error: any) {
      yield this.mapTransportError(error);
      return;
    }

    // 4. Process Stream and Apply Output Safety Checks
    try {
      for await (const chunk of stream) {
        if (options.enableAiSafety) {
          try {
            await options.safetyPolicy.validateResponse(responseBuffer + chunk, language);
          } catch (error: any) {
             const verdict = asSafetyVerdict(error);
             if (verdict) {
               yield verdict.code === 'prompt_injection'
                 ? { type: 'error', error: { type: 'prompt_injection', language: verdict.language } }
                 : { type: 'error', error: { type: 'restricted_content', code: verdict.code, language: verdict.language } };
               return;
             }
             yield { type: 'error', error: { type: 'general', originalError: error } };
             return;
          }
        } else {
          const isSafe = options.safetyPolicy.checkPromptInjectionOnly(responseBuffer + chunk, language);
          if (!isSafe) {
            yield { type: 'error', error: { type: 'prompt_injection' } };
            return;
          }
        }

        responseBuffer += chunk;
        yield { type: 'chunk', text: chunk };
      }
    } catch (error: any) {
      yield this.mapTransportError(error);
      return;
    }

    yield { type: 'end', fullResponse: responseBuffer, responseTimeMs: Date.now() - startTime };
  }

  private mapTransportError(error: any): StreamEvent {
    const isRateLimitError = error?.message?.includes('rate limit') || 
                             error?.type === 'rate_limit_error' ||
                             error?.message?.includes('429') ||
                             error?.status === 429;
    if (isRateLimitError) {
      return { type: 'error', error: { type: 'rate_limit' } };
    }
    if (error?.status === 529 || error?.error?.type === "overloaded_error" || error?.message?.includes('overloaded')) {
      return { type: 'error', error: { type: 'overloaded' } };
    }
    if (error?.status === 400) {
      return { type: 'error', error: { type: 'bad_request' } };
    }
    if (error?.status === 401) {
      return { type: 'error', error: { type: 'auth' } };
    }
    return { type: 'error', error: { type: 'general', originalError: error } };
  }
}
