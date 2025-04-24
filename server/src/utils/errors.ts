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