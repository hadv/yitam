# TypeScript Claude Chat Bot

A modern chat bot application built with TypeScript that uses Claude AI API to power conversations.

## Components

- **Server**: Node.js Express server that connects to Claude AI API using the Anthropic SDK
- **Client**: React-based web application that provides a chat interface

## Prerequisites

- Node.js (LTS version)
- npm or yarn
- Anthropic API key

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm run install:all
   ```
3. Configure environment variables:
   - Copy `server/.env.example` to `server/.env`
   - Add your Anthropic API key to `server/.env`

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