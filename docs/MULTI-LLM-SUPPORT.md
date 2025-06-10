# Multi-LLM Provider Support

This document describes the multi-LLM provider support implemented in the application, allowing you to use Anthropic Claude, OpenAI GPT, and Google Gemini models interchangeably.

## Overview

The application now supports multiple LLM providers through a unified abstraction layer that provides:

- **Provider Abstraction**: Unified interface for all LLM providers
- **Automatic Fallback**: Switch to backup providers when primary fails
- **Streaming Support**: Real-time response streaming for all providers
- **Error Handling**: Provider-specific error handling and recovery
- **Configuration Management**: Easy provider switching and configuration

## Supported Providers

### 1. Anthropic Claude
- **Models**: claude-3-7-sonnet-20250219, claude-3-haiku-20240307, claude-3-sonnet-20240229, claude-3-opus-20240229
- **Features**: Full tool support, streaming, function calling
- **API Key**: `ANTHROPIC_API_KEY`

### 2. OpenAI GPT
- **Models**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo
- **Features**: Full tool support, streaming, function calling
- **API Key**: `OPENAI_API_KEY`

### 3. Google Gemini
- **Models**: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro
- **Features**: Full tool support, streaming, function calling
- **API Key**: `GOOGLE_API_KEY`

## Configuration

### Environment Variables

```bash
# Primary LLM provider
LLM_PROVIDER=anthropic  # Options: anthropic, openai, google

# Model configuration
LLM_MODEL=claude-3-7-sonnet-20250219
LLM_MAX_TOKENS=10000
LLM_TEMPERATURE=0.7
LLM_TOP_P=1.0

# API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# Fallback configuration
LLM_FALLBACK_ENABLED=true
LLM_FALLBACK_PROVIDERS=anthropic,openai
```

### Provider Selection

The system selects providers in the following order:

1. **Primary Provider**: Specified by `LLM_PROVIDER`
2. **Fallback Providers**: Used when primary fails (rate limits, quota exceeded)
3. **Error Handling**: Graceful degradation with user-friendly error messages

## Usage Examples

### Basic Usage

```typescript
import { LLMService } from './services/LLMService';

// Initialize with default provider from config
const llmService = new LLMService();

// Or initialize with specific provider
const llmService = new LLMService(apiKey, 'openai');

// Generate response
const response = await llmService.generateResponse([
  { role: 'user', content: 'Hello, how are you?' }
]);

console.log(response.content);
```

### Streaming Responses

```typescript
await llmService.generateStreamingResponse(
  messages,
  (chunk) => {
    if (chunk.type === 'text') {
      console.log(chunk.content);
    }
    return true; // Continue streaming
  }
);
```

### Provider Factory

```typescript
import { LLMProviderFactory } from './providers/LLMProviderFactory';

// Create specific provider
const provider = LLMProviderFactory.createProvider({
  provider: 'openai',
  apiKey: 'your-api-key',
  config: {
    model: 'gpt-4o',
    maxTokens: 4000,
    temperature: 0.7
  }
});

// Get available providers
const providers = LLMProviderFactory.getAvailableProviders();
console.log(providers); // ['anthropic', 'openai', 'google']
```

## Architecture

### Core Components

1. **LLMProvider Interface**: Common interface for all providers
2. **Provider Implementations**: Anthropic, OpenAI, Google-specific implementations
3. **LLMProviderFactory**: Creates and manages provider instances
4. **LLMService**: High-level service with fallback support
5. **Type Definitions**: Unified types for messages, tools, and responses

### Message Flow

```
User Input → LLMService → Primary Provider → Response
                ↓ (on failure)
            Fallback Provider → Response
```

### Error Handling

The system handles various error types:

- **Rate Limit Errors**: Automatic fallback to alternative providers
- **Quota Exceeded**: User-friendly error messages with provider info
- **Authentication Errors**: Clear API key validation messages
- **Network Errors**: Retry logic and graceful degradation

## Migration Guide

### From Anthropic-Only to Multi-LLM

1. **Update Environment Variables**:
   ```bash
   # Add new variables
   LLM_PROVIDER=anthropic
   OPENAI_API_KEY=your_openai_key
   GOOGLE_API_KEY=your_google_key
   ```

2. **Update Code** (if using direct Anthropic SDK):
   ```typescript
   // Old way
   import { Anthropic } from '@anthropic-ai/sdk';
   const anthropic = new Anthropic({ apiKey });
   
   // New way
   import { LLMService } from './services/LLMService';
   const llmService = new LLMService(apiKey, 'anthropic');
   ```

3. **Test Configuration**:
   ```bash
   npm test -- llm-providers.test.ts
   ```

## Best Practices

### 1. Provider Selection
- Use **Anthropic Claude** for complex reasoning and analysis
- Use **OpenAI GPT** for general conversation and creative tasks
- Use **Google Gemini** for multimodal tasks and fast responses

### 2. Fallback Configuration
- Always configure at least 2 providers for redundancy
- Order fallback providers by preference and cost
- Monitor usage across providers to optimize costs

### 3. Error Handling
- Implement proper error boundaries in your UI
- Log provider failures for monitoring
- Provide clear user feedback for different error types

### 4. Performance Optimization
- Cache provider instances when possible
- Use appropriate token limits for each use case
- Monitor response times across providers

## Troubleshooting

### Common Issues

1. **Provider Not Available**
   - Check API key configuration
   - Verify provider is in available list
   - Check network connectivity

2. **Fallback Not Working**
   - Ensure `LLM_FALLBACK_ENABLED=true`
   - Verify fallback providers have valid API keys
   - Check fallback provider list format

3. **Streaming Issues**
   - Verify provider supports streaming
   - Check callback function implementation
   - Monitor for network interruptions

### Debug Mode

Enable debug logging:
```bash
DEBUG=llm:* npm start
```

## API Reference

See the TypeScript interfaces in `src/types/LLMTypes.ts` for complete API documentation.

## Contributing

When adding new LLM providers:

1. Implement the `LLMProvider` interface
2. Add provider to `LLMProviderFactory`
3. Update configuration documentation
4. Add comprehensive tests
5. Update this documentation

## License

This multi-LLM support is part of the main application and follows the same license terms.
