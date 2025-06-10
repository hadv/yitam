import { Anthropic } from "@anthropic-ai/sdk";
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

export class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateResponse(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<LLMResponse> {
    try {
      const finalConfig = { ...this.getDefaultConfig(), ...config };
      
      // Convert messages to Anthropic format
      const anthropicMessages = this.convertMessages(messages);
      
      // Convert tools to Anthropic format
      const anthropicTools = tools ? this.convertTools(tools) : undefined;

      const response = await this.client.messages.create({
        model: finalConfig.model,
        max_tokens: finalConfig.maxTokens,
        temperature: finalConfig.temperature,
        top_p: finalConfig.topP,
        stop_sequences: finalConfig.stopSequences,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      return this.convertResponse(response);
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
      
      // Convert messages to Anthropic format
      const anthropicMessages = this.convertMessages(messages);
      
      // Convert tools to Anthropic format
      const anthropicTools = tools ? this.convertTools(tools) : undefined;

      const stream = await this.client.messages.stream({
        model: finalConfig.model,
        max_tokens: finalConfig.maxTokens,
        temperature: finalConfig.temperature,
        top_p: finalConfig.topP,
        stop_sequences: finalConfig.stopSequences,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      for await (const chunk of stream) {
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
      'claude-3-7-sonnet-20250219',
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229',
      'claude-3-opus-20240229'
    ];
  }

  getDefaultConfig(): LLMConfig {
    return {
      model: 'claude-3-7-sonnet-20250219',
      maxTokens: 4000,
      temperature: 0.7,
      topP: 1.0
    };
  }

  private convertMessages(messages: LLMMessage[]): any[] {
    return messages
      .filter(msg => msg.role !== 'system') // System messages handled separately in Anthropic
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));
  }

  private convertTools(tools: LLMTool[]): any[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }));
  }

  private convertResponse(response: any): LLMResponse {
    let content = '';
    const toolCalls: LLMToolCall[] = [];

    if (response.content) {
      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input
          });
        }
      }
    }

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage ? {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      } : undefined
    };
  }

  private convertStreamChunk(chunk: any): LLMStreamChunk | null {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      return {
        type: 'text',
        content: chunk.delta.text
      };
    } else if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
      return {
        type: 'tool_call',
        tool_call: {
          id: chunk.content_block.id,
          name: chunk.content_block.name,
          arguments: {}
        }
      };
    }
    return null;
  }

  private handleError(error: any): LLMError {
    if (error.status === 401) {
      return new LLMAuthenticationError(this.name);
    } else if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'] ? parseInt(error.headers['retry-after']) : undefined;
      if (error.message?.includes('quota')) {
        return new LLMQuotaExceededError(this.name);
      }
      return new LLMRateLimitError(this.name, retryAfter);
    } else {
      return new LLMError(
        error.message || 'Unknown error occurred',
        this.name,
        error.code,
        error.status
      );
    }
  }
}
