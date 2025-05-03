# MCP Server HTTP/SSE Configuration Guide

## Overview

This document provides information on the updated MCP server configuration, which uses HTTP/SSE (Server-Sent Events) for communication instead of the previously used stdio-based transport.

## Benefits of HTTP/SSE Transport

1. **Improved Scalability**: HTTP/SSE allows for better scaling across multiple instances and containers
2. **Better Reliability**: More stable connection with automatic reconnection capabilities
3. **Distributed Deployments**: Easier to distribute MCP server instances across different hosts
4. **Standard Protocol**: Uses standard HTTP protocol with well-defined behavior
5. **Security**: Can be secured with standard HTTP security practices

## Configuration

### Docker Compose

The Docker Compose configuration has been updated to:

1. Expose the MCP server on an internal port (3030)
2. Configure the server container to connect to the MCP server via HTTP URL
3. Maintain backward compatibility with the previous stdio-based transport

```yaml
services:
  yitam-mcp:
    # ...existing config...
    ports:
      - "127.0.0.1:3030:3030"  # Only exposed locally for security
    environment:
      - PORT=3030
      - MCP_SERVER_HOST=0.0.0.0
      - NODE_ENV=production

  server:
    # ...existing config...
    environment:
      # ...other environment variables...
      - MCP_SERVER_URL=http://yitam-mcp:3030/sse  # New HTTP/SSE endpoint
      - MCP_SERVER_PATH=/app/mcp/core/server/yitam-tools.js  # Kept for backward compatibility
```

### Environment Variables

- `PORT`: The port on which the MCP server will listen for HTTP connections
- `MCP_SERVER_URL`: The URL of the MCP server's HTTP/SSE endpoint (e.g., `http://yitam-mcp:3030/sse`)
- `MCP_SERVER_PATH`: (Deprecated) The path to the MCP server script for stdio-based transport
- `MCP_SERVER_HOST`: The host binding for the MCP server - determines which network interfaces to listen on:
  - `0.0.0.0`: Listen on all network interfaces (required for Docker inter-container communication)
  - `localhost` or `127.0.0.1`: Listen only on the loopback interface (more secure but prevents container-to-container communication)

## Implementation Details

### Client Transport

The client has been updated to use the `SSEClientTransport` from the MCP SDK:

```typescript
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Create transport with a URL object
const transport = new SSEClientTransport(new URL("http://yitam-mcp:3030/sse"));

// Connect client
client.connect(transport);
```

### Server Configuration

The MCP server needs to be configured to handle HTTP/SSE connections. Make sure your yitam-tools.ts file uses the MCP_SERVER_HOST environment variable:

```typescript
// In yitam-mcp/src/core/server/yitam-tools.ts
// Modify the app.listen call to include the host parameter:

// Start HTTP server
const host = process.env.MCP_SERVER_HOST || 'localhost';
app.listen(port, host, () => {
  console.log(`YITAM Server running with SSE transport on ${host}:${port}`);
  console.log(`SSE endpoint: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/sse`);
  console.log(`Messages endpoint: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/messages`);
});
```

This change ensures the server actually listens on the correct network interfaces as specified by MCP_SERVER_HOST.

## Security Considerations

- **Port Binding**: Setting `MCP_SERVER_HOST=0.0.0.0` makes the server listen on all interfaces *inside* the container
- **Docker Network Security**: The actual exposure to external networks is controlled by the port mapping in docker-compose.yml
- **Local-Only Exposure**: Using `"127.0.0.1:3030:3030"` in the ports mapping ensures the MCP server is only accessible from the host machine, not from the external network
- **Container-to-Container Communication**: Despite the local-only port mapping, other containers can still access the MCP server using Docker's internal network
- **No External Authentication**: Since the service is only exposed locally, no additional authentication is required for the SSE endpoint

## Troubleshooting

1. **Connection Issues**: 
   - Check network connectivity between containers
   - Verify the MCP server is properly exposing the HTTP/SSE endpoint
   - Confirm MCP_SERVER_HOST is set to "0.0.0.0" in the environment
   - Ensure the code in yitam-tools.ts uses the host parameter in app.listen()

2. **Port Already in Use**:
   - Change the port in the Docker Compose configuration if 3030 is already in use

3. **Fallback Behavior**:
   - The client will automatically fallback to direct API if the MCP server connection fails 