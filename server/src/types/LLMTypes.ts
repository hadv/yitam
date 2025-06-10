/**
 * Common types and interfaces for LLM providers
 */

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  } | any; // Allow any type for compatibility with different tool schemas
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LLMToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

export interface LLMStreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content?: string;
  tool_call?: LLMToolCall;
  tool_result?: LLMToolResult;
  error?: string;
  done?: boolean;
}

export interface LLMResponse {
  content: string;
  tool_calls?: LLMToolCall[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface LLMConfig {
  model: string;
  maxTokens: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface LLMProviderConfig {
  provider: 'anthropic' | 'openai' | 'google';
  apiKey: string;
  config: LLMConfig;
}

export type LLMStreamCallback = (chunk: LLMStreamChunk) => boolean | Promise<boolean> | void;

/**
 * Base interface that all LLM providers must implement
 */
export interface LLMProvider {
  /**
   * Provider name for identification
   */
  readonly name: string;

  /**
   * Generate a response from the LLM
   */
  generateResponse(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<LLMResponse>;

  /**
   * Generate a streaming response from the LLM
   */
  generateStreamingResponse(
    messages: LLMMessage[],
    streamCallback: LLMStreamCallback,
    config?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<void>;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get supported models for this provider
   */
  getSupportedModels(): string[];

  /**
   * Get default configuration for this provider
   */
  getDefaultConfig(): LLMConfig;
}

/**
 * Error types for LLM operations
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(provider: string, retryAfter?: number) {
    super(`Rate limit exceeded for ${provider}`, provider, 'RATE_LIMIT');
    this.retryAfter = retryAfter;
  }
  
  public retryAfter?: number;
}

export class LLMAuthenticationError extends LLMError {
  constructor(provider: string) {
    super(`Authentication failed for ${provider}`, provider, 'AUTH_ERROR', 401);
  }
}

export class LLMQuotaExceededError extends LLMError {
  constructor(provider: string) {
    super(`Quota exceeded for ${provider}`, provider, 'QUOTA_EXCEEDED', 429);
  }
}
