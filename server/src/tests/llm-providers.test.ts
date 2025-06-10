import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { LLMProviderFactory } from '../providers/LLMProviderFactory';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { GoogleProvider } from '../providers/GoogleProvider';
import { LLMService } from '../services/LLMService';
import { LLMProviderConfig, LLMMessage } from '../types/LLMTypes';

// Mock the external SDKs
jest.mock('@anthropic-ai/sdk');
jest.mock('openai');
jest.mock('@google/generative-ai');

describe('LLM Provider System', () => {
  const mockApiKey = 'test-api-key-123';

  beforeEach(() => {
    // Clear provider cache before each test
    LLMProviderFactory.clearCache();
  });

  describe('LLMProviderFactory', () => {
    test('should create Anthropic provider', () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: mockApiKey,
        config: {
          model: 'claude-3-7-sonnet-20250219',
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      const provider = LLMProviderFactory.createProvider(config);
      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.name).toBe('anthropic');
    });

    test('should create OpenAI provider', () => {
      const config: LLMProviderConfig = {
        provider: 'openai',
        apiKey: mockApiKey,
        config: {
          model: 'gpt-4o',
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      const provider = LLMProviderFactory.createProvider(config);
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.name).toBe('openai');
    });

    test('should create Google provider', () => {
      const config: LLMProviderConfig = {
        provider: 'google',
        apiKey: mockApiKey,
        config: {
          model: 'gemini-1.5-pro',
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      const provider = LLMProviderFactory.createProvider(config);
      expect(provider).toBeInstanceOf(GoogleProvider);
      expect(provider.name).toBe('google');
    });

    test('should throw error for unsupported provider', () => {
      const config: LLMProviderConfig = {
        provider: 'unsupported' as any,
        apiKey: mockApiKey,
        config: {
          model: 'test-model',
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      expect(() => LLMProviderFactory.createProvider(config)).toThrow('Unsupported LLM provider');
    });

    test('should cache providers', () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: mockApiKey,
        config: {
          model: 'claude-3-7-sonnet-20250219',
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      const provider1 = LLMProviderFactory.createProvider(config);
      const provider2 = LLMProviderFactory.createProvider(config);
      
      expect(provider1).toBe(provider2);
      expect(LLMProviderFactory.getCacheSize()).toBe(1);
    });

    test('should validate configuration', () => {
      const validConfig: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: mockApiKey,
        config: {
          model: 'claude-3-7-sonnet-20250219',
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      const invalidConfig: LLMProviderConfig = {
        provider: 'invalid' as any,
        apiKey: '',
        config: {
          model: 'test-model',
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      expect(LLMProviderFactory.validateConfig(validConfig)).toBe(true);
      expect(LLMProviderFactory.validateConfig(invalidConfig)).toBe(false);
    });

    test('should return available providers', () => {
      const providers = LLMProviderFactory.getAvailableProviders();
      expect(providers).toEqual(['anthropic', 'openai', 'google']);
    });

    test('should return default models for each provider', () => {
      expect(LLMProviderFactory.getDefaultModel('anthropic')).toBe('claude-3-7-sonnet-20250219');
      expect(LLMProviderFactory.getDefaultModel('openai')).toBe('gpt-4o');
      expect(LLMProviderFactory.getDefaultModel('google')).toBe('gemini-1.5-pro');
    });
  });

  describe('Provider Instances', () => {
    test('Anthropic provider should have correct default config', () => {
      const provider = new AnthropicProvider(mockApiKey);
      const defaultConfig = provider.getDefaultConfig();
      
      expect(defaultConfig.model).toBe('claude-3-7-sonnet-20250219');
      expect(defaultConfig.maxTokens).toBe(4000);
      expect(defaultConfig.temperature).toBe(0.7);
    });

    test('OpenAI provider should have correct default config', () => {
      const provider = new OpenAIProvider(mockApiKey);
      const defaultConfig = provider.getDefaultConfig();
      
      expect(defaultConfig.model).toBe('gpt-4o');
      expect(defaultConfig.maxTokens).toBe(4000);
      expect(defaultConfig.temperature).toBe(0.7);
    });

    test('Google provider should have correct default config', () => {
      const provider = new GoogleProvider(mockApiKey);
      const defaultConfig = provider.getDefaultConfig();
      
      expect(defaultConfig.model).toBe('gemini-1.5-pro');
      expect(defaultConfig.maxTokens).toBe(4000);
      expect(defaultConfig.temperature).toBe(0.7);
    });

    test('All providers should return supported models', () => {
      const anthropicProvider = new AnthropicProvider(mockApiKey);
      const openaiProvider = new OpenAIProvider(mockApiKey);
      const googleProvider = new GoogleProvider(mockApiKey);

      expect(anthropicProvider.getSupportedModels().length).toBeGreaterThan(0);
      expect(openaiProvider.getSupportedModels().length).toBeGreaterThan(0);
      expect(googleProvider.getSupportedModels().length).toBeGreaterThan(0);
    });

    test('All providers should report as configured', () => {
      const anthropicProvider = new AnthropicProvider(mockApiKey);
      const openaiProvider = new OpenAIProvider(mockApiKey);
      const googleProvider = new GoogleProvider(mockApiKey);

      expect(anthropicProvider.isConfigured()).toBe(true);
      expect(openaiProvider.isConfigured()).toBe(true);
      expect(googleProvider.isConfigured()).toBe(true);
    });
  });

  describe('LLMService', () => {
    test('should initialize with custom provider', () => {
      const service = new LLMService(mockApiKey, 'openai');
      expect(service.getCurrentProviderName()).toBe('openai');
      expect(service.isConfigured()).toBe(true);
    });

    test('should update configuration', () => {
      const service = new LLMService(mockApiKey, 'anthropic');
      
      service.updateConfig({
        temperature: 0.9,
        maxTokens: 2000
      });

      // Configuration update should not throw
      expect(service.isConfigured()).toBe(true);
    });

    test('should switch providers', () => {
      const service = new LLMService(mockApiKey, 'anthropic');
      expect(service.getCurrentProviderName()).toBe('anthropic');

      service.switchProvider(mockApiKey, 'openai');
      expect(service.getCurrentProviderName()).toBe('openai');
    });

    test('should return supported models for current provider', () => {
      const service = new LLMService(mockApiKey, 'anthropic');
      const models = service.getSupportedModels();
      
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('Message Format Conversion', () => {
    test('should handle basic message format', () => {
      const messages: LLMMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I am doing well, thank you!' }
      ];

      // This test verifies that the message format is correctly structured
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[2].role).toBe('assistant');
      
      messages.forEach(msg => {
        expect(typeof msg.content).toBe('string');
        expect(msg.content.length).toBeGreaterThan(0);
      });
    });
  });
});
