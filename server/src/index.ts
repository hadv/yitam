import express, { Express } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { MCPClient } from './MCPClient';
import { config } from './config';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
app.use(cors(config.server.cors));
app.use(express.json());

const PORT = config.server.port;

// Create HTTP server
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: config.server.cors,
  allowEIO3: true,
  transports: ['polling', 'websocket']
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Initialize MCP client
let mcpClient: MCPClient | null = null;
let mcpConnected = false;

// Only try to connect to MCP if path is provided and not empty
if (process.env.MCP_SERVER_PATH && process.env.MCP_SERVER_PATH.trim() !== '') {
  mcpClient = new MCPClient(process.env.ANTHROPIC_API_KEY || '');
  mcpClient.connectToServer(process.env.MCP_SERVER_PATH)
    .then(connected => {
      mcpConnected = connected;
      if (connected) {
        console.log('Successfully connected to MCP server');
      } else {
        console.log('Failed to connect to MCP server, falling back to direct Claude API');
      }
    })
    .catch(err => {
      console.error('Error connecting to MCP server:', err);
      console.log('Falling back to direct Claude API');
    });
} else {
  console.log('No MCP server path provided, using direct Claude API');
}

// Socket.IO connection handler
io.on('connection', (socket: Socket) => {
  console.log('A user connected:', socket.id);

  // Handle chat messages
  socket.on('chat-message', async (message: string) => {
    try {
      console.log('Received message:', message);
      
      let responseText = '';
      
      // Check if MCP client is connected and use it if available
      if (mcpClient && mcpConnected) {
        // Process message using MCP client
        responseText = await mcpClient.processQuery(message);
      } else {
        // Fallback to direct Claude API
        const response = await anthropic.messages.create({
          model: config.model.name,
          max_tokens: config.model.maxTokens,
          messages: [
            { role: 'user', content: message }
          ],
        });

        // Extract text content from response
        responseText = response.content[0].type === 'text' 
          ? response.content[0].text 
          : 'Received a non-text response';
      }

      // Send response back to client
      socket.emit('bot-response', {
        text: responseText,
        id: Date.now().toString(),
      });
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('bot-response', {
        text: 'Sorry, I encountered an error processing your request.',
        id: Date.now().toString(),
      });
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 