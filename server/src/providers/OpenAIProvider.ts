import OpenAI from 'openai';
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

export class OpenAIProvider implements LLMProvider {
  public readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateResponse(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<LLMResponse> {
    try {
      const finalConfig = { ...this.getDefaultConfig(), ...config };
      
      // Convert messages to OpenAI format
      const openaiMessages = this.convertMessages(messages);
      
      // Convert tools to OpenAI format
      const openaiTools = tools ? this.convertTools(tools) : undefined;

      const response = await this.client.chat.completions.create({
        model: finalConfig.model,
        messages: openaiMessages,
        max_tokens: finalConfig.maxTokens,
        temperature: finalConfig.temperature,
        top_p: finalConfig.topP,
        stop: finalConfig.stopSequences,
        tools: openaiTools,
        tool_choice: openaiTools ? 'auto' : undefined,
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
      
      // Convert messages to OpenAI format
      const openaiMessages = this.convertMessages(messages);
      
      // Convert tools to OpenAI format
      const openaiTools = tools ? this.convertTools(tools) : undefined;

      const stream = await this.client.chat.completions.create({
        model: finalConfig.model,
        messages: openaiMessages,
        max_tokens: finalConfig.maxTokens,
        temperature: finalConfig.temperature,
        top_p: finalConfig.topP,
        stop: finalConfig.stopSequences,
        tools: openaiTools,
        tool_choice: openaiTools ? 'auto' : undefined,
        stream: true,
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
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo'
    ];
  }

  getDefaultConfig(): LLMConfig {
    return {
      model: 'gpt-4o',
      maxTokens: 4000,
      temperature: 0.7,
      topP: 1.0
    };
  }

  private convertMessages(messages: LLMMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content
    }));
  }

  private convertTools(tools: LLMTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  private convertResponse(response: OpenAI.Chat.Completions.ChatCompletion): LLMResponse {
    const choice = response.choices[0];
    const message = choice.message;
    
    let content = message.content || '';
    const toolCalls: LLMToolCall[] = [];

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}')
          });
        }
      }
    }

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage ? {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      } : undefined
    };
  }

  private convertStreamChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): LLMStreamChunk | null {
    const choice = chunk.choices[0];
    if (!choice) return null;

    const delta = choice.delta;
    
    if (delta.content) {
      return {
        type: 'text',
        content: delta.content
      };
    } else if (delta.tool_calls) {
      const toolCall = delta.tool_calls[0];
      if (toolCall && toolCall.function) {
        return {
          type: 'tool_call',
          tool_call: {
            id: toolCall.id || '',
            name: toolCall.function.name || '',
            arguments: JSON.parse(toolCall.function.arguments || '{}')
          }
        };
      }
    }

    return null;
  }

  private handleError(error: any): LLMError {
    if (error.status === 401) {
      return new LLMAuthenticationError(this.name);
    } else if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'] ? parseInt(error.headers['retry-after']) : undefined;
      if (error.message?.includes('quota') || error.message?.includes('billing')) {
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
