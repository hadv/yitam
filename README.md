# Multi-LLM Chat Bot with MCP Integration

A modern chat bot application built with TypeScript that supports multiple LLM providers (Anthropic Claude, OpenAI GPT, Google Gemini) with Model Context Protocol (MCP) integration for enhanced AI capabilities.

## Features

- **🤖 Multi-LLM Support**: Choose from Anthropic Claude, OpenAI GPT, or Google Gemini
- **🔄 Automatic Fallback**: Seamless switching between providers for maximum reliability
- **⚡ Real-time Streaming**: Live response generation with WebSocket communication
- **🛠️ Tool Integration**: Enhanced AI capabilities through MCP protocol
- **🔒 Content Safety**: Built-in moderation and safety checks
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices
- **🌐 Production Ready**: Docker deployment with SSL support

## Components

- **Server**: Node.js Express server with multi-LLM provider support
- **Client**: React-based web application that provides a chat interface
- **MCP Integration**: Model Context Protocol integration for enhanced AI tool capabilities

## Prerequisites

- Node.js (LTS version) - recommended to use `nvm use --lts`
- npm - for package management
- Docker and Docker Compose - for production deployment
- **LLM API Keys** (at least one required):
  - Anthropic API key (for Claude models)
  - OpenAI API key (for GPT models)
  - Google API key (for Gemini models)
- MCP integration setup

## Setup

### Local Development

1. Clone the repository
2. Install dependencies:
   ```
   npm run install:all
   ```
3. Configure environment variables:
   - Copy `server/.env.example` to `server/.env`
   - Add your LLM provider API keys to `server/.env`:
     ```bash
     # Choose your primary provider
     LLM_PROVIDER=anthropic  # or openai, google

     # Add API keys (at least one required)
     ANTHROPIC_API_KEY=your_anthropic_key_here
     OPENAI_API_KEY=your_openai_key_here
     GOOGLE_API_KEY=your_google_key_here

     # Enable fallback for reliability
     LLM_FALLBACK_ENABLED=true
     LLM_FALLBACK_PROVIDERS=anthropic,openai,google
     ```
   - Configure MCP-related environment variables

### Docker Production Deployment

1. Clone the repository
2. Configure environment variables:
   - Copy `server/.env.example` to `server/.env`
   - Add your Anthropic API key to `server/.env`
   - Configure MCP-related environment variables
3. Build and run with Docker Compose:
   ```bash
   docker-compose up --build -d
   ```
4. Access the application:
   - Web interface: http://localhost
   - API endpoint: http://localhost/api

The application uses the `unless-stopped` restart policy, which means containers will automatically restart:
- On failure/crash
- When Docker daemon restarts
- After system reboots
But will respect manual stop commands, making maintenance easier.

### Domain Configuration

When deploying with a custom domain (e.g., yitam.org), follow these important steps:

1. SSL Certificates:
   - Create an `ssl` directory at the root of your project
   - Place your SSL certificates in the directory:
     - `ssl/yitam.org.crt` - Your SSL certificate
     - `ssl/yitam.org.key` - Your private key
   - Add the `ssl` directory to your `.gitignore` to avoid committing sensitive files
   - Use the provided `get-ssl-cert.sh` script to automatically obtain and configure SSL certificates with Let's Encrypt

2. DNS Configuration:
   - Configure your domain's DNS records to point to your server's IP address
   - Both `www.yitam.org` and `yitam.org` are supported in the configuration

3. Access the application:
   - Web interface: https://yitam.org
   - API endpoint: https://yitam.org/api

The application is configured to automatically restart in case of crashes or system reboots.

To check container status:
```bash
docker-compose ps
```

To view logs:
```bash
docker-compose logs -f
```

To stop the application:
```bash
docker-compose down
```

## Running the application

### Development mode

To run both server and client in development mode:

```
npm run dev
```

Or separately:

```
npm run server  # Run just the server
npm run client  # Run just the client
```

### Production mode

#### Using Docker (Recommended)
See Docker Production Deployment section above.

#### Manual Production Setup
To build for production:

```
npm run build
```

Then to run the server:

```
cd server && npm start
```

## Multi-LLM Provider System

This application supports multiple LLM providers with automatic fallback capabilities:

### Supported Providers

| Provider | Models | Features |
|----------|--------|----------|
| **Anthropic** | Claude-3.7-Sonnet, Claude-3-Haiku, Claude-3-Sonnet, Claude-3-Opus | Tool calling, Streaming, Function calling |
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-4, GPT-3.5-turbo | Tool calling, Streaming, Function calling |
| **Google** | Gemini-1.5-pro, Gemini-1.5-flash, Gemini-1.0-pro | Tool calling, Streaming, Function calling |

### Configuration Examples

```bash
# Use OpenAI as primary with Anthropic fallback
LLM_PROVIDER=openai
LLM_FALLBACK_ENABLED=true
LLM_FALLBACK_PROVIDERS=openai,anthropic

# Use Anthropic with Google fallback
LLM_PROVIDER=anthropic
LLM_FALLBACK_PROVIDERS=anthropic,google

# Model-specific configuration
LLM_MODEL=gpt-4o
LLM_MAX_TOKENS=4000
LLM_TEMPERATURE=0.7
```

### Benefits

- **Reliability**: Automatic fallback when primary provider fails
- **Cost Optimization**: Choose providers based on cost and performance
- **Rate Limit Handling**: Seamless switching during rate limits
- **Unified Interface**: Same API regardless of provider

## Server API

The server uses Socket.IO for real-time communication with the client, and integrates with the Model Context Protocol for enhanced AI tool capabilities.

## Support the Project

If you find this project useful, please consider supporting its development:

[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa.svg)](https://github.com/sponsors/hadv)

Your support helps maintain and improve the project!

## Technology Stack

- **Server**:
  - TypeScript
  - Express
  - Socket.IO
  - Anthropic SDK (Claude AI)
  - Model Context Protocol (MCP) SDK

- **Client**:
  - TypeScript
  - React 19
  - Socket.IO Client
  - React Markdown
  - Vite 6

- **Production Environment**:
  - Docker
  - Docker Compose
  - Nginx (serving client and reverse proxy)
  - Let's Encrypt SSL certificate automation
