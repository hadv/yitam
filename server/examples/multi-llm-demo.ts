/**
 * Multi-LLM Provider Demo
 * 
 * This example demonstrates how to use different LLM providers
 * (Anthropic, OpenAI, Google Gemini) with the unified interface.
 */

import { LLMService } from '../src/services/LLMService';
import { LLMProviderFactory } from '../src/providers/LLMProviderFactory';
import { LLMMessage, LLMProviderConfig } from '../src/types/LLMTypes';

// Mock API keys for demonstration (replace with real keys)
const API_KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || 'sk-ant-api03-demo-key',
  openai: process.env.OPENAI_API_KEY || 'sk-demo-key',
  google: process.env.GOOGLE_API_KEY || 'demo-key'
};

async function demonstrateProviderFactory() {
  console.log('\n=== LLM Provider Factory Demo ===\n');

  // Show available providers
  console.log('Available providers:', LLMProviderFactory.getAvailableProviders());

  // Show default models for each provider
  for (const provider of LLMProviderFactory.getAvailableProviders()) {
    console.log(`Default model for ${provider}:`, LLMProviderFactory.getDefaultModel(provider));
    console.log(`Supported models for ${provider}:`, LLMProviderFactory.getSupportedModels(provider));
  }

  // Create providers using factory
  for (const [providerName, apiKey] of Object.entries(API_KEYS)) {
    try {
      const config: LLMProviderConfig = {
        provider: providerName as 'anthropic' | 'openai' | 'google',
        apiKey,
        config: {
          model: LLMProviderFactory.getDefaultModel(providerName),
          maxTokens: 100,
          temperature: 0.7
        }
      };

      const provider = LLMProviderFactory.createProvider(config);
      console.log(`✓ Created ${provider.name} provider successfully`);
    } catch (error) {
      console.log(`✗ Failed to create ${providerName} provider:`, (error as Error).message);
    }
  }

  console.log(`\nProvider cache size: ${LLMProviderFactory.getCacheSize()}`);
}

async function demonstrateLLMService() {
  console.log('\n=== LLM Service Demo ===\n');

  // Test each provider
  for (const [providerName, apiKey] of Object.entries(API_KEYS)) {
    console.log(`\n--- Testing ${providerName.toUpperCase()} Provider ---`);
    
    try {
      const llmService = new LLMService(apiKey, providerName);
      
      console.log(`Provider: ${llmService.getCurrentProviderName()}`);
      console.log(`Configured: ${llmService.isConfigured()}`);
      console.log(`Supported models: ${llmService.getSupportedModels().slice(0, 3).join(', ')}...`);

      console.log('✓ Service initialized successfully');
    } catch (error) {
      console.log(`✗ Error with ${providerName}:`, (error as Error).message);
    }
  }
}

async function main() {
  console.log('🚀 Multi-LLM Provider System Demo');
  console.log('=====================================');

  await demonstrateProviderFactory();
  await demonstrateLLMService();

  console.log('\n✨ Demo completed!');
  console.log('\nTo use with real API keys:');
  console.log('1. Set environment variables: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY');
  console.log('2. Run: npx ts-node examples/multi-llm-demo.ts');
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}

export { main as runMultiLLMDemo };
