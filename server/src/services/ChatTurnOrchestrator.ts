export type ChatError = 
  | { type: 'restricted_content'; code: string }
  | { type: 'prompt_injection' }
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

export interface StreamChatTurnOptions {
  input: string;
  chatId: string;
  personaId?: string;
  context: ContextMessage[];
  safetyPolicy: SafetyPolicy;
  transport: TransportAdapter;
  enableAiSafety: boolean;
  language?: string; // e.g. 'vi' or 'en'
}

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
      if (error?.code) { // Assuming ContentSafetyError has a code
        if (['medical_advice', 'financial_advice', 'legal_advice', 'product_marketing'].includes(error.code)) {
          yield { type: 'error', error: { type: 'restricted_content', code: error.code } };
          return;
        } else if (error.code === 'prompt_injection') {
          yield { type: 'error', error: { type: 'prompt_injection' } };
          return;
        }
      }
      yield { type: 'error', error: { type: 'general', originalError: error } };
      return;
    }

    // 2. Stream from Transport Adapter
    let responseBuffer = '';
    let stream: AsyncIterableIterator<string>;
    
    try {
      stream = options.transport.streamResponse(sanitizedMessage, options.context, options.personaId);
    } catch (error: any) {
      yield this.mapTransportError(error);
      return;
    }

    // 3. Process Stream and Apply Output Safety Checks
    try {
      for await (const chunk of stream) {
        if (options.enableAiSafety) {
          try {
            await options.safetyPolicy.validateResponse(responseBuffer + chunk, language);
          } catch (error: any) {
             if (error?.code) {
               if (['medical_advice', 'financial_advice', 'legal_advice', 'product_marketing'].includes(error.code)) {
                 yield { type: 'error', error: { type: 'restricted_content', code: error.code } };
                 return;
               } else if (error.code === 'prompt_injection') {
                 yield { type: 'error', error: { type: 'prompt_injection' } };
                 return;
               }
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
