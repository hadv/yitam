import { GoogleGenerativeAI, GenerativeModel, Content, Part, Tool as GoogleTool } from '@google/generative-ai';
import {
  LLMProvider,
  LLMMessage,
  LLMTool,
  LLMResponse,
  LLMConfig,
  LLMStreamCallback,
  LLMStreamChunk,
  LLMError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMQuotaExceededError,
  LLMToolCall
} from '../types/LLMTypes';

export class GoogleProvider implements LLMProvider {
  public readonly name = 'google';
  private client: GoogleGenerativeAI;
  private model: GenerativeModel | null = null;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<LLMResponse> {
    try {
      const finalConfig = { ...this.getDefaultConfig(), ...config };
      
      // Initialize model with config
      this.initializeModel(finalConfig, tools);
      
      // Convert messages to Google format
      const { contents, systemInstruction } = this.convertMessages(messages);

      const result = await this.model!.generateContent({
        contents,
        systemInstruction,
        generationConfig: {
          maxOutputTokens: finalConfig.maxTokens,
          temperature: finalConfig.temperature,
          topP: finalConfig.topP,
          stopSequences: finalConfig.stopSequences,
        }
      });

      return this.convertResponse(result);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async generateStreamingResponse(
    messages: LLMMessage[],
    streamCallback: LLMStreamCallback,
    config?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<void> {
    try {
      const finalConfig = { ...this.getDefaultConfig(), ...config };
      
      // Initialize model with config
      this.initializeModel(finalConfig, tools);
      
      // Convert messages to Google format
      const { contents, systemInstruction } = this.convertMessages(messages);

      const result = await this.model!.generateContentStream({
        contents,
        systemInstruction,
        generationConfig: {
          maxOutputTokens: finalConfig.maxTokens,
          temperature: finalConfig.temperature,
          topP: finalConfig.topP,
          stopSequences: finalConfig.stopSequences,
        }
      });

      for await (const chunk of result.stream) {
        const streamChunk = this.convertStreamChunk(chunk);
        if (streamChunk) {
          const shouldContinue = await streamCallback(streamChunk);
          if (shouldContinue === false) {
            break;
          }
        }
      }

      // Send final chunk to indicate completion
      await streamCallback({ type: 'text', content: '', done: true });
    } catch (error) {
      const streamChunk: LLMStreamChunk = {
        type: 'error',
        error: this.handleError(error).message,
        done: true
      };
      await streamCallback(streamChunk);
    }
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  getSupportedModels(): string[] {
    return [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.0-pro'
    ];
  }

  getDefaultConfig(): LLMConfig {
    return {
      model: 'gemini-1.5-pro',
      maxTokens: 4000,
      temperature: 0.7,
      topP: 1.0
    };
  }

  private initializeModel(config: LLMConfig, tools?: LLMTool[]): void {
    const modelConfig: any = {
      model: config.model,
    };

    if (tools && tools.length > 0) {
      modelConfig.tools = this.convertTools(tools);
    }

    this.model = this.client.getGenerativeModel(modelConfig);
  }

  private convertMessages(messages: LLMMessage[]): { contents: Content[], systemInstruction?: Content } {
    let systemInstruction: Content | undefined;
    const contents: Content[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        systemInstruction = {
          role: 'user',
          parts: [{ text: message.content }]
        };
      } else {
        contents.push({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        });
      }
    }

    return { contents, systemInstruction };
  }

  private convertTools(tools: LLMTool[]): GoogleTool[] {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }))
    }];
  }

  private convertResponse(result: any): LLMResponse {
    const response = result.response;
    let content = '';
    const toolCalls: LLMToolCall[] = [];

    if (response.candidates && response.candidates[0]) {
      const candidate = response.candidates[0];
      
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            content += part.text;
          } else if (part.functionCall) {
            toolCalls.push({
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {}
            });
          }
        }
      }
    }

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usageMetadata ? {
        input_tokens: response.usageMetadata.promptTokenCount || 0,
        output_tokens: response.usageMetadata.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata.totalTokenCount || 0
      } : undefined
    };
  }

  private convertStreamChunk(chunk: any): LLMStreamChunk | null {
    if (chunk.candidates && chunk.candidates[0]) {
      const candidate = chunk.candidates[0];
      
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            return {
              type: 'text',
              content: part.text
            };
          } else if (part.functionCall) {
            return {
              type: 'tool_call',
              tool_call: {
                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: part.functionCall.name,
                arguments: part.functionCall.args || {}
              }
            };
          }
        }
      }
    }

    return null;
  }

  private handleError(error: any): LLMError {
    const message = error.message || 'Unknown error occurred';
    
    if (message.includes('API_KEY_INVALID') || message.includes('401')) {
      return new LLMAuthenticationError(this.name);
    } else if (message.includes('RATE_LIMIT') || message.includes('429')) {
      return new LLMRateLimitError(this.name);
    } else if (message.includes('QUOTA_EXCEEDED') || message.includes('billing')) {
      return new LLMQuotaExceededError(this.name);
    } else {
      return new LLMError(message, this.name, error.code, error.status);
    }
  }
}
