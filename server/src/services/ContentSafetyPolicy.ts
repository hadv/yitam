import { SafetyPolicy } from './ChatTurnOrchestrator';
import { contentSafetyService } from './ContentSafety';
import { Language } from '../types';

/** What the policy needs from the safety service. */
export interface SafetyChecks {
  validateContent(content: string): Promise<void>;
  sanitizeContent(content: string): string;
  validateResponse(content: string, language: Language): Promise<void>;
  checkPromptInjectionOnly(content: string, language: Language): boolean;
}

/**
 * `contentSafetyService` as the orchestrator wants to see it.
 *
 * Thin on purpose. What it buys is that the orchestrator names a policy rather than
 * a singleton — a test can hand it a fake, and the AI-safety switch stays a
 * decision the caller makes when it builds the service.
 */
export class ContentSafetyPolicy implements SafetyPolicy {
  constructor(private readonly service: SafetyChecks = contentSafetyService) {}

  validateContent(message: string): Promise<void> {
    return this.service.validateContent(message);
  }

  sanitizeContent(message: string): string {
    return this.service.sanitizeContent(message);
  }

  validateResponse(chunk: string, language: string): Promise<void> {
    return this.service.validateResponse(chunk, language as Language);
  }

  checkPromptInjectionOnly(chunk: string, language: string): boolean {
    return this.service.checkPromptInjectionOnly(chunk, language as Language);
  }
}
