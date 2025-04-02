# TypeScript Claude Chat Bot

A modern chat bot application built with TypeScript that uses Claude AI API to power conversations.

## Components

- **Server**: Node.js Express server that connects to Claude AI API using the Anthropic SDK
- **Client**: React-based web application that provides a chat interface

## Prerequisites

- Node.js (LTS version) - for local development
- npm or yarn - for local development
- Docker and Docker Compose - for production deployment
- Anthropic API key

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

### Docker Production Deployment

1. Clone the repository
2. Configure environment variables:
   - Copy `server/.env.example` to `server/.env`
   - Add your Anthropic API key to `server/.env`
3. Build and run with Docker Compose:
   ```bash
   docker-compose up --build -d
   ```
4. Access the application:
   - Web interface: http://localhost
   - API endpoint: http://localhost/api

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

The server uses Socket.IO for real-time communication with the client.

## Technology Stack

- **Server**:
  - TypeScript
  - Express
  - Socket.IO
  - Anthropic SDK (Claude AI)

- **Client**:
  - TypeScript
  - React
  - Socket.IO Client
  - Vite

- **Production Environment**:
  - Docker
  - Docker Compose
  - Nginx (serving client and reverse proxy) 