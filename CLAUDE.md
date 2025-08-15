# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is a full-stack TypeScript chat application with Claude AI integration and Model Context Protocol (MCP) support. The architecture consists of:

### Core Components
- **Server** (`server/`): Express.js backend with Socket.IO for real-time communication
- **Client** (`client/`): React 19 + Vite frontend with Tailwind CSS
- **Database**: SQLite with two separate databases:
  - `server/data/shared_conversations.db` - shared conversations and general acupoint data
  - `server/data/qigong.db` - Qigong-specific vessel and acupoint management
- **MCP Integration**: Model Context Protocol for enhanced AI tool capabilities
- **Cache System**: In-memory cache for development, with Redis support for production

### Key Architecture Patterns
- **Dual Database Strategy**: Separate databases for different feature domains (shared conversations vs qigong management)
- **Real-time Communication**: Socket.IO for bidirectional client-server messaging
- **Feature Flags**: Unleash integration for progressive feature rollout
- **Component Architecture**: Tailwind-based UI components in `client/src/components/tailwind/`
- **Specialized Features**: 
  - Qigong symbol detection with Google Vision API
  - Pinyin generation for Chinese characters
  - Advanced conversation persistence and sharing

## Development Commands

### Installation
```bash
# Install all dependencies (root, client, and server)
npm run install:all

# Install individually
npm install          # Root dependencies
cd client && npm install
cd server && npm install
```

### Development
```bash
# Run both client and server concurrently (recommended)
npm run dev

# Run separately
npm run client       # React dev server (port 3001)
npm run server       # Express server with nodemon (port 5001)
```

### Server Development
```bash
cd server

# Development with auto-rebuild and restart
npm run dev

# Development with ts-node (faster startup)
npm run dev:ts

# Build TypeScript
npm run build

# Production mode
npm start
```

### Client Development
```bash
cd client

# Development server
npm run dev

# Type checking only
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing
```bash
cd server

# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Test Pinyin service specifically
npm run test:pinyin
```

### Specialized Scripts
```bash
cd server

# Generate Pinyin for existing acupoints (preview mode)
npm run generate-pinyin:preview

# Actually generate Pinyin for existing acupoints
npm run generate-pinyin
```

## Important Configuration

### Environment Variables
- Server uses `.env` file in `server/` directory
- Client uses Vite environment variables (VITE_ prefix)
- Key variables include:
  - `ANTHROPIC_API_KEY` - Claude API access
  - `NODE_ENV` - development/production
  - `CACHE_TYPE` - memory/redis cache selection
  - `CLIENT_URL` - CORS configuration

### Node.js Version
- Use LTS version: `nvm use --lts` (as specified in `.cursor/rules/nvm.mdc`)

## Database Operations

### Schema Locations
- Server database schemas: `server/src/db/database.ts` and `server/src/db/qigongDatabase.ts`
- Client IndexedDB schema: `client/src/db/ChatHistoryDB.ts`

### Key Database Features
- **Shared Conversations**: Full conversation sharing with access codes and expiration
- **Qigong Management**: Vessels and acupoints with coordinate-based highlighting
- **Pinyin Integration**: Automatic Pinyin generation for Chinese characters using `pinyin` package
- **Client-side Storage**: Dexie.js for IndexedDB with advanced cleanup and recovery mechanisms

## Testing Strategy

- **Server Tests**: Jest with ts-jest configuration
- **Test Location**: `server/src/tests/`
- **Test Pattern**: `*.test.ts` files
- **Key Test Areas**: Content safety, sample questions, pinyin services

## Production Deployment

### Docker
```bash
# Build and run with Docker Compose
docker-compose up --build -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### SSL Configuration
- Place SSL certificates in `ssl/` directory (gitignored)
- Use `get-ssl-cert.sh` for Let's Encrypt automation
- Configured for `yitam.org` domain

## Special Features

### Cache Debug Panel
- Press `Ctrl+Shift+C` in the application for cache monitoring
- Real-time statistics and cache management tools

### MCP Integration
- Model Context Protocol support for enhanced AI capabilities
- Configuration in `mcp.env` file

### Qigong Symbol Detection
- Google Cloud Vision integration for symbol detection
- Coordinate-based acupoint highlighting on vessel images

### Pinyin Generation
- Automatic Pinyin generation for Chinese characters
- Service at `server/src/services/pinyinService.ts`

## Development Tips

- **Client Hot Reload**: Vite provides instant updates during development
- **Server Auto-restart**: Nodemon watches TypeScript files and rebuilds automatically
- **Cache Development**: Uses in-memory cache by default (no external dependencies)
- **Database Debugging**: Comprehensive logging for both SQLite and IndexedDB operations
- **Feature Flags**: Unleash integration allows for gradual feature rollout

## Code Structure Notes

- **Tailwind Components**: Primary UI components in `client/src/components/tailwind/`
- **Legacy Components**: Original components in `client/src/components/` (being migrated)
- **Services Layer**: Business logic separated into `server/src/services/` and `client/src/services/`
- **Type Definitions**: Shared types in `server/src/types/` and `client/src/types/`
- **Database Utilities**: Helper functions in `client/src/db/` for IndexedDB operations

## Build Process

- **Client Build**: `tsc --noEmit || true && vite build` (continues on TypeScript errors)
- **Server Build**: Standard `tsc` compilation
- **Production**: Dockerized deployment with Nginx reverse proxy