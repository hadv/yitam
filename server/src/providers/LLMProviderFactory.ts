import { LLMProvider, LLMProviderConfig, LLMError } from '../types/LLMTypes';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GoogleProvider } from './GoogleProvider';

/**
 * Factory class for creating LLM providers
 */
export class LLMProviderFactory {
  private static providers: Map<string, LLMProvider> = new Map();

  /**
   * Create or get a cached LLM provider instance
   */
  static createProvider(config: LLMProviderConfig): LLMProvider {
    const cacheKey = `${config.provider}_${config.apiKey.substring(0, 10)}`;
    
    // Return cached provider if available
    if (this.providers.has(cacheKey)) {
      const provider = this.providers.get(cacheKey)!;
      if (provider.isConfigured()) {
        return provider;
      }
    }

    // Create new provider
    let provider: LLMProvider;
    
    switch (config.provider) {
      case 'anthropic':
        provider = new AnthropicProvider(config.apiKey);
        break;
      case 'openai':
        provider = new OpenAIProvider(config.apiKey);
        break;
      case 'google':
        provider = new GoogleProvider(config.apiKey);
        break;
      default:
        throw new LLMError(
          `Unsupported LLM provider: ${config.provider}`,
          'factory',
          'UNSUPPORTED_PROVIDER'
        );
    }

    // Validate provider configuration
    if (!provider.isConfigured()) {
      throw new LLMError(
        `Failed to configure ${config.provider} provider`,
        config.provider,
        'CONFIGURATION_ERROR'
      );
    }

    // Cache the provider
    this.providers.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Get available provider types
   */
  static getAvailableProviders(): string[] {
    return ['anthropic', 'openai', 'google'];
  }

  /**
   * Validate provider configuration
   */
  static validateConfig(config: LLMProviderConfig): boolean {
    if (!config.provider || !config.apiKey) {
      return false;
    }

    if (!this.getAvailableProviders().includes(config.provider)) {
      return false;
    }

    return true;
  }

  /**
   * Clear provider cache
   */
  static clearCache(): void {
    this.providers.clear();
  }

  /**
   * Get cached provider count
   */
  static getCacheSize(): number {
    return this.providers.size;
  }

  /**
   * Create provider from environment variables
   */
  static createFromEnvironment(): LLMProvider {
    const provider = process.env.LLM_PROVIDER || 'anthropic';
    let apiKey: string;

    switch (provider) {
      case 'anthropic':
        apiKey = process.env.ANTHROPIC_API_KEY || '';
        break;
      case 'openai':
        apiKey = process.env.OPENAI_API_KEY || '';
        break;
      case 'google':
        apiKey = process.env.GOOGLE_API_KEY || '';
        break;
      default:
        throw new LLMError(
          `Unsupported LLM provider in environment: ${provider}`,
          'factory',
          'UNSUPPORTED_PROVIDER'
        );
    }

    if (!apiKey) {
      throw new LLMError(
        `API key not found for ${provider} provider`,
        provider,
        'MISSING_API_KEY'
      );
    }

    const config: LLMProviderConfig = {
      provider: provider as 'anthropic' | 'openai' | 'google',
      apiKey,
      config: {
        model: process.env.LLM_MODEL || '',
        maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000'),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      }
    };

    return this.createProvider(config);
  }

  /**
   * Get default model for a provider
   */
  static getDefaultModel(providerType: string): string {
    switch (providerType) {
      case 'anthropic':
        return 'claude-3-7-sonnet-20250219';
      case 'openai':
        return 'gpt-4o';
      case 'google':
        return 'gemini-1.5-pro';
      default:
        throw new LLMError(
          `Unknown provider type: ${providerType}`,
          'factory',
          'UNKNOWN_PROVIDER'
        );
    }
  }

  /**
   * Get supported models for a provider
   */
  static getSupportedModels(providerType: string): string[] {
    const tempProvider = this.createTempProvider(providerType);
    return tempProvider.getSupportedModels();
  }

  /**
   * Create a temporary provider instance for metadata queries
   */
  private static createTempProvider(providerType: string): LLMProvider {
    const dummyApiKey = 'dummy_key_for_metadata';
    
    switch (providerType) {
      case 'anthropic':
        return new AnthropicProvider(dummyApiKey);
      case 'openai':
        return new OpenAIProvider(dummyApiKey);
      case 'google':
        return new GoogleProvider(dummyApiKey);
      default:
        throw new LLMError(
          `Unknown provider type: ${providerType}`,
          'factory',
          'UNKNOWN_PROVIDER'
        );
    }
  }
}
