import { 
  LLMProvider, 
  LLMMessage, 
  LLMTool, 
  LLMResponse, 
  LLMConfig, 
  LLMStreamCallback,
  LLMProviderConfig,
  LLMError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMQuotaExceededError
} from '../types/LLMTypes';
import { LLMProviderFactory } from '../providers/LLMProviderFactory';
import { config } from '../config';

/**
 * Service class that provides a unified interface for LLM operations
 * with support for multiple providers and fallback mechanisms
 */
export class LLMService {
  private primaryProvider: LLMProvider | null = null;
  private fallbackProviders: LLMProvider[] = [];
  private currentConfig: LLMConfig;

  constructor(apiKey?: string, providerType?: string) {
    this.currentConfig = this.getDefaultConfig();
    
    if (apiKey && providerType) {
      this.initializeWithCustomProvider(apiKey, providerType);
    } else {
      this.initializeFromConfig();
    }
  }

  /**
   * Generate a response using the primary provider with fallback support
   */
  async generateResponse(
    messages: LLMMessage[],
    customConfig?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<LLMResponse> {
    const finalConfig = { ...this.currentConfig, ...customConfig };
    
    // Try primary provider first
    if (this.primaryProvider) {
      try {
        return await this.primaryProvider.generateResponse(messages, finalConfig, tools);
      } catch (error) {
        console.error(`Primary provider (${this.primaryProvider.name}) failed:`, error);
        
        // If it's a rate limit or quota error, try fallback
        if (this.shouldTryFallback(error)) {
          return await this.tryFallbackProviders(messages, finalConfig, tools, 'generateResponse');
        }
        
        throw error;
      }
    }

    throw new LLMError('No LLM provider available', 'service', 'NO_PROVIDER');
  }

  /**
   * Generate a streaming response using the primary provider with fallback support
   */
  async generateStreamingResponse(
    messages: LLMMessage[],
    streamCallback: LLMStreamCallback,
    customConfig?: Partial<LLMConfig>,
    tools?: LLMTool[]
  ): Promise<void> {
    const finalConfig = { ...this.currentConfig, ...customConfig };
    
    // Try primary provider first
    if (this.primaryProvider) {
      try {
        return await this.primaryProvider.generateStreamingResponse(messages, streamCallback, finalConfig, tools);
      } catch (error) {
        console.error(`Primary provider (${this.primaryProvider.name}) failed:`, error);
        
        // If it's a rate limit or quota error, try fallback
        if (this.shouldTryFallback(error)) {
          return await this.tryFallbackProviders(messages, finalConfig, tools, 'generateStreamingResponse', streamCallback);
        }
        
        throw error;
      }
    }

    throw new LLMError('No LLM provider available', 'service', 'NO_PROVIDER');
  }

  /**
   * Get the current provider name
   */
  getCurrentProviderName(): string {
    return this.primaryProvider?.name || 'none';
  }

  /**
   * Get supported models for the current provider
   */
  getSupportedModels(): string[] {
    return this.primaryProvider?.getSupportedModels() || [];
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.primaryProvider?.isConfigured() || false;
  }

  /**
   * Update the current configuration
   */
  updateConfig(newConfig: Partial<LLMConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
  }

  /**
   * Switch to a different provider
   */
  switchProvider(apiKey: string, providerType: string): void {
    this.initializeWithCustomProvider(apiKey, providerType);
  }

  private initializeFromConfig(): void {
    try {
      // Initialize primary provider
      const primaryProviderType = config.llm.provider;
      const primaryApiKey = config.llm.apiKeys[primaryProviderType];
      
      if (primaryApiKey) {
        const primaryConfig: LLMProviderConfig = {
          provider: primaryProviderType,
          apiKey: primaryApiKey,
          config: this.currentConfig
        };
        
        this.primaryProvider = LLMProviderFactory.createProvider(primaryConfig);
        console.log(`Initialized primary LLM provider: ${primaryProviderType}`);
      }

      // Initialize fallback providers if enabled
      if (config.llm.fallback.enabled) {
        this.initializeFallbackProviders();
      }
    } catch (error) {
      console.error('Failed to initialize LLM service from config:', error);
    }
  }

  private initializeWithCustomProvider(apiKey: string, providerType: string): void {
    try {
      const providerConfig: LLMProviderConfig = {
        provider: providerType as 'anthropic' | 'openai' | 'google',
        apiKey,
        config: this.currentConfig
      };
      
      this.primaryProvider = LLMProviderFactory.createProvider(providerConfig);
      console.log(`Initialized custom LLM provider: ${providerType}`);
    } catch (error) {
      console.error(`Failed to initialize custom provider ${providerType}:`, error);
      throw error;
    }
  }

  private initializeFallbackProviders(): void {
    const fallbackProviderTypes = config.llm.fallback.providers
      .filter(provider => provider !== config.llm.provider);

    for (const providerType of fallbackProviderTypes) {
      try {
        const apiKey = config.llm.apiKeys[providerType as keyof typeof config.llm.apiKeys];
        if (apiKey) {
          const fallbackConfig: LLMProviderConfig = {
            provider: providerType as 'anthropic' | 'openai' | 'google',
            apiKey,
            config: this.currentConfig
          };
          
          const fallbackProvider = LLMProviderFactory.createProvider(fallbackConfig);
          this.fallbackProviders.push(fallbackProvider);
          console.log(`Initialized fallback LLM provider: ${providerType}`);
        }
      } catch (error) {
        console.warn(`Failed to initialize fallback provider ${providerType}:`, error);
      }
    }
  }

  private shouldTryFallback(error: any): boolean {
    return error instanceof LLMRateLimitError || 
           error instanceof LLMQuotaExceededError ||
           (error instanceof LLMError && error.code === 'RATE_LIMIT');
  }

  private async tryFallbackProviders(
    messages: LLMMessage[],
    config: LLMConfig,
    tools?: LLMTool[],
    method: 'generateResponse' | 'generateStreamingResponse' = 'generateResponse',
    streamCallback?: LLMStreamCallback
  ): Promise<any> {
    for (const fallbackProvider of this.fallbackProviders) {
      try {
        console.log(`Trying fallback provider: ${fallbackProvider.name}`);
        
        if (method === 'generateResponse') {
          return await fallbackProvider.generateResponse(messages, config, tools);
        } else if (method === 'generateStreamingResponse' && streamCallback) {
          return await fallbackProvider.generateStreamingResponse(messages, streamCallback, config, tools);
        }
      } catch (error) {
        console.warn(`Fallback provider ${fallbackProvider.name} also failed:`, error);
        continue;
      }
    }

    throw new LLMError('All LLM providers failed', 'service', 'ALL_PROVIDERS_FAILED');
  }

  private getDefaultConfig(): LLMConfig {
    return {
      model: config.llm.model.name,
      maxTokens: config.llm.model.maxTokens,
      temperature: config.llm.model.temperature,
      topP: config.llm.model.topP,
    };
  }
}
