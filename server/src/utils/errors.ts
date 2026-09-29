export class ContentSafetyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly language: 'en' | 'vi' = 'en'
  ) {
    super(message);
    this.name = 'ContentSafetyError';
  }
}

/**
 * The model declined to answer: the response ended with stop_reason 'refusal'.
 *
 * A refusal is not an API error. It arrives as an ordinary end of stream, after
 * whatever text came before it, so without a check the partial text passes for
 * a finished reply, or an empty one for silence. Raising it lets the socket
 * handler end the reply with a message, and keeps the text out of history.
 */
export class ModelRefusalError extends Error {
  constructor(public readonly category: string | null = null) {
    super(`Model declined to answer${category ? ` (${category})` : ''}`);
    this.name = 'ModelRefusalError';
  }
}
