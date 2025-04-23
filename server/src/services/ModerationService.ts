import { Anthropic } from "@anthropic-ai/sdk";
import { config } from '../config';

export interface ModerationResult {
  isSafe: boolean;
  categories: {
    hate: boolean;
    harassment: boolean;
    selfHarm: boolean;
    sexual: boolean;
    violence: boolean;
    illegal: boolean;
  };
  reason?: string;
}

export class ModerationService {
  private anthropic: Anthropic;
  private readonly MODERATION_SYSTEM_PROMPT = `You are a content moderation system. Analyze the given text and determine if it contains any of the following categories of harmful content:

1. Hate speech or discrimination
2. Harassment or bullying
3. Self-harm or suicide
4. Sexual content or explicit material
5. Violence or threats
6. Illegal activities or instructions

For each category, respond with either "true" or "false". Then provide a brief explanation if any category is flagged as true.

Format your response as JSON with the following structure:
{
  "isSafe": boolean,
  "categories": {
    "hate": boolean,
    "harassment": boolean,
    "selfHarm": boolean,
    "sexual": boolean,
    "violence": boolean,
    "illegal": boolean
  },
  "reason": string (only if isSafe is false)
}`;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async moderateContent(content: string): Promise<ModerationResult> {
    try {
      const response = await this.anthropic.messages.create({
        model: config.model.name,
        max_tokens: 500,
        system: this.MODERATION_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: content
        }]
      });

      if (response.content[0]?.type === "text") {
        try {
          const result = JSON.parse(response.content[0].text) as ModerationResult;
          return result;
        } catch (parseError) {
          console.error("Error parsing moderation response:", parseError);
          return {
            isSafe: false,
            categories: {
              hate: false,
              harassment: false,
              selfHarm: false,
              sexual: false,
              violence: false,
              illegal: false
            },
            reason: "Error parsing moderation response"
          };
        }
      }

      return {
        isSafe: false,
        categories: {
          hate: false,
          harassment: false,
          selfHarm: false,
          sexual: false,
          violence: false,
          illegal: false
        },
        reason: "Invalid moderation response format"
      };
    } catch (error) {
      console.error("Error in content moderation:", error);
      return {
        isSafe: false,
        categories: {
          hate: false,
          harassment: false,
          selfHarm: false,
          sexual: false,
          violence: false,
          illegal: false
        },
        reason: "Error during moderation check"
      };
    }
  }
} 