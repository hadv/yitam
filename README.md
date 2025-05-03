# TypeScript Claude Chat Bot with MCP Integration

A modern chat bot application built with TypeScript that uses Claude AI API to power conversations, with Model Context Protocol (MCP) integration for enhanced AI capabilities.

## Components

- **Server**: Node.js Express server that connects to Claude AI API using the Anthropic SDK
- **Client**: React-based web application that provides a chat interface
- **MCP Integration**: Model Context Protocol integration for enhanced AI tool capabilities

## Prerequisites

- Node.js (LTS version) - recommended to use `nvm use --lts`
- npm - for package management
- Docker and Docker Compose - for production deployment
- Anthropic API key
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
   - Add your Anthropic API key to `server/.env`
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

## MCP Server Communication

### HTTP/SSE Transport

The project now uses HTTP/SSE (Server-Sent Events) transport for communication with the MCP server, replacing the previous stdio-based transport. This change improves scalability, reliability, and facilitates distributed deployments.

#### Benefits

- Better scalability across multiple instances
- Improved reliability with automatic reconnection
- Easier deployment in distributed environments
- Standard HTTP protocol with well-defined behavior

#### Configuration

The Docker Compose configuration has been updated to:

1. Expose the MCP server on an internal port (3030)
2. Configure the server container to connect via HTTP URL
3. Maintain backward compatibility with stdio-based transport

The environment variables have been updated:

- `MCP_SERVER_URL`: The URL of the MCP server's HTTP/SSE endpoint
- `MCP_SERVER_PATH`: (Deprecated) The path to the MCP server script for stdio transport

#### Setup

To update your deployment to use HTTP/SSE transport:

```bash
# Run the update script
./update-mcp-to-http-sse.sh

# Restart the containers
docker-compose down
docker-compose up --build -d
```

For more details, see the [MCP Server HTTP/SSE Configuration Guide](docs/mcp-server-http-sse.md).