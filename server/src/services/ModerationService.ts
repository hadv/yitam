import { Anthropic } from "@anthropic-ai/sdk";
import { config } from '../config';
import { getResponseText } from '../utils/anthropicResponse';

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
        // Kept on the main model: moderation is a safety decision, so it keeps
        // full reasoning. That means thinking shares max_tokens with the JSON
        // verdict, so this needs headroom the same way content safety does.
        max_tokens: 10000,
        system: this.MODERATION_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: content
        }]
      });

      const rawText = getResponseText(response);
      if (rawText !== undefined) {
        try {
          let responseText = rawText;
          
          // Handle markdown-formatted JSON (remove ```json and ``` delimiters)
          if (responseText.includes('```')) {
            responseText = responseText.replace(/```json\s*|\s*```/g, '');
          }
          
          // Clean the JSON string to remove any unexpected characters
          // Trim whitespace and look for JSON starting with {
          responseText = responseText.trim();
          const jsonStartIndex = responseText.indexOf('{');
          const jsonEndIndex = responseText.lastIndexOf('}') + 1;
          
          if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
            // Extract just the JSON part
            responseText = responseText.substring(jsonStartIndex, jsonEndIndex);
          }
          
          // Try to parse the cleaned JSON
          const result = JSON.parse(responseText) as ModerationResult;
          return result;
        } catch (parseError) {
          console.error("Error parsing moderation response:", parseError);
          console.log("Raw response:", rawText);

          // Try to extract a valid JSON object using regex as a fallback
          try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
              const extractedJson = jsonMatch[0];
              console.log("Attempting to parse extracted JSON:", extractedJson);
              const fallbackResult = JSON.parse(extractedJson) as ModerationResult;
              return fallbackResult;
            }
          } catch (fallbackError) {
            console.error("Fallback parsing also failed:", fallbackError);
          }
          
          // If all parsing attempts fail, default to safe to avoid blocking legitimate content
          console.log("Defaulting to safe content after parsing failures");
          return {
            isSafe: true,
            categories: {
              hate: false,
              harassment: false,
              selfHarm: false,
              sexual: false,
              violence: false,
              illegal: false
            }
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