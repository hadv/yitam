import { ContextMessage, TransportAdapter } from './ChatTurnOrchestrator';

/** The slice of the MCP client this adapter needs. */
export interface StreamingMcpClient {
  processQueryWithStreaming(
    query: string,
    streamCallback: (text: string) => boolean | Promise<boolean> | void,
    chatId?: string,
    personaId?: string,
    contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<void>;
}

/**
 * The transport that runs a turn through the MCP server, where the model may call
 * tools before it answers.
 *
 * The MCP client pushes text into a callback; the orchestrator pulls text out of an
 * iterator. This adapter is the join between the two: chunks land in a queue, the
 * generator drains it, and a consumer that stops reading — the orchestrator cutting
 * a turn short on a safety verdict — makes the callback return `false`, which is
 * how the client is told to stop producing.
 */
export class MCPTransportAdapter implements TransportAdapter {
  constructor(
    private readonly mcpClient: StreamingMcpClient,
    private readonly chatId: string
  ) {}

  async *streamResponse(
    message: string,
    context: ContextMessage[],
    personaId?: string
  ): AsyncIterableIterator<string> {
    const queue: string[] = [];
    let finished = false;
    let failure: unknown;
    let stopped = false;
    let wake: (() => void) | null = null;

    const nudge = () => {
      wake?.();
      wake = null;
    };

    const running = this.mcpClient
      .processQueryWithStreaming(
        message,
        chunk => {
          if (stopped) return false;
          queue.push(chunk);
          nudge();
          return true;
        },
        this.chatId,
        personaId,
        this.toContextMessages(context)
      )
      .then(
        () => {
          finished = true;
        },
        error => {
          failure = error;
          finished = true;
        }
      )
      .then(nudge);

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift() as string;
        }
        if (finished) break;
        await new Promise<void>(resolve => {
          wake = resolve;
        });
      }
    } finally {
      // Reached on a normal end and on an early return, which is what a `break` in
      // the consumer compiles to. Either way the client must hear about it.
      stopped = true;
      nudge();
    }

    await running;

    if (failure) {
      throw failure;
    }
  }

  /** MCP takes a plain transcript; a `system` entry is not part of one. */
  private toContextMessages(
    context: ContextMessage[]
  ): Array<{ role: 'user' | 'assistant'; content: string }> | undefined {
    const transcript = context
      .filter(entry => entry.role === 'user' || entry.role === 'assistant')
      .filter(entry => typeof entry.content === 'string' && entry.content.trim())
      .map(entry => ({ role: entry.role as 'user' | 'assistant', content: entry.content }));

    return transcript.length > 0 ? transcript : undefined;
  }
}
