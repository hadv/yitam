import express, { Express } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { MCPClient } from './MCPClient';
import { config } from './config';
import { sampleQuestions } from './data/sampleQuestions';

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

  // Send sample questions when requested
  socket.on('get-sample-questions', (limit: number = 6) => {
    console.log(`Sample questions requested with limit: ${limit}`);
    
    // Randomly select items from the sampleQuestions array
    const shuffled = [...sampleQuestions].sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, Math.min(limit, sampleQuestions.length));
    
    socket.emit('sample-questions', selectedQuestions);
  });

  // Handle chat messages
  socket.on('chat-message', async (message: string) => {
    try {
      console.log('Received message:', message);
      
      // Generate a unique message ID for this response
      const messageId = Date.now().toString();
      
      // Let the client know we're starting a response
      socket.emit('bot-response-start', { id: messageId });
      
      // Check if MCP client is connected and use it if available
      if (mcpClient && mcpConnected) {
        // Process message using MCP client with streaming callback
        await mcpClient.processQueryWithStreaming(message, (chunk) => {
          socket.emit('bot-response-chunk', {
            id: messageId,
            text: chunk
          });
        });
      } else {
        // Fallback to direct Claude API with streaming
        const stream = await anthropic.messages.stream({
          model: config.model.name,
          max_tokens: config.model.maxTokens,
          messages: [
            { role: 'user', content: message }
          ],
        });

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            // Send each text chunk to the client
            socket.emit('bot-response-chunk', {
              id: messageId,
              text: chunk.delta.text
            });
          }
        }
      }

      // Signal that the response is complete
      socket.emit('bot-response-end', { id: messageId });
    } catch (error: any) {
      console.error('Error processing message:', error);
      
      // Generate a unique message ID for the error response
      const errorId = Date.now().toString();
      
      let errorMessage = 'Sorry, I encountered an error processing your request.';
      
      // Check for specific Claude API errors
      if (error?.status === 529 || (error?.error?.type === "overloaded_error")) {
        errorMessage = "Claude API is currently experiencing high traffic. Please try again in a few moments.";
      } else if (error?.status === 400) {
        errorMessage = "Sorry, there was an error processing your request. The input may be too long or contain unsupported content.";
      } else if (error?.status === 401) {
        errorMessage = "Authentication error. Please check your API key configuration.";
      } else if (error?.status === 429) {
        errorMessage = "Rate limit exceeded. Please try again later.";
      }
      
      // Send error response directly (not streaming)
      socket.emit('bot-response', {
        text: errorMessage,
        id: errorId,
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