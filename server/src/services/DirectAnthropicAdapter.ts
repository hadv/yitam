import Anthropic from '@anthropic-ai/sdk';
import { ContextMessage, TransportAdapter } from './ChatTurnOrchestrator';

export interface DirectAnthropicOptions {
  model: string;
  maxTokens: number;
  /** Prepended context — summaries and key facts the context engine produced. */
  system?: string;
}

/**
 * The transport that talks to Anthropic directly, used when no MCP server is
 * connected.
 *
 * Its whole job is to turn a message stream into text chunks: everything the
 * stream carries that is not assistant text — thinking blocks, block starts and
 * stops, usage — is not part of the reply the user reads.
 */
export class DirectAnthropicAdapter implements TransportAdapter {
  constructor(
    private readonly anthropic: Anthropic,
    private readonly options: DirectAnthropicOptions
  ) {}

  async *streamResponse(
    message: string,
    context: ContextMessage[],
    _personaId?: string
  ): AsyncIterableIterator<string> {
    const messages = this.toApiMessages(message, context);

    const stream = await this.anthropic.messages.stream({
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      messages,
      system: this.options.system || undefined,
    });

    for await (const event of stream as AsyncIterable<any>) {
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield event.delta.text as string;
      }
    }
  }

  /**
   * The API takes an alternating user/assistant transcript. A `system` role in the
   * context belongs in the system prompt, not the transcript, and empty content is
   * rejected outright — so both are dropped. With nothing left, the message the
   * user just sent is the transcript.
   */
  private toApiMessages(
    message: string,
    context: ContextMessage[]
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const transcript = context
      .filter(entry => entry.role === 'user' || entry.role === 'assistant')
      .filter(entry => typeof entry.content === 'string' && entry.content.trim())
      .map(entry => ({ role: entry.role as 'user' | 'assistant', content: entry.content }));

    return transcript.length > 0 ? transcript : [{ role: 'user', content: message }];
  }
}
