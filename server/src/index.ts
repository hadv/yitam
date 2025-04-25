import express, { Express } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { MCPClient } from './MCPClient';
import { config } from './config';
import { sampleQuestions } from './data/sampleQuestions';
import { contentSafetyService } from './services/contentSafety';
import { ContentSafetyError } from './utils/errors';
import { LegalService } from './services/legalService';
import legalRoutes, { handleLegalDocumentRequest } from './routes/legal';
import { validateAccessCode } from './middleware/accessControl';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
app.use(cors(config.server.cors));
app.use(express.json());

// Apply access control middleware to all routes except health check
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  validateAccessCode(req, res, next);
});

const PORT = config.server.port;

// Create HTTP server
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: config.server.cors,
  allowEIO3: true,
  transports: ['polling', 'websocket']
});

// Initialize services
const legalService = LegalService.getInstance();

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

// Error messages for different languages
const ERROR_MESSAGES = {
  restricted_content: {
    en: 'I apologize, but I cannot process this request as it contains restricted content. For your safety and compliance with our policies, I cannot provide advice or information about: medical conditions, financial investments, legal matters, or engage in product marketing.',
    vi: 'Xin lỗi, tôi không thể xử lý yêu cầu này vì nó chứa nội dung bị hạn chế. Để đảm bảo an toàn và tuân thủ chính sách của chúng tôi, tôi không thể cung cấp tư vấn hoặc thông tin về: các vấn đề y tế, đầu tư tài chính, vấn đề pháp lý, hoặc tham gia tiếp thị sản phẩm.'
  },
  invalid_content: {
    en: 'I apologize, but I cannot process this request as it contains invalid content.',
    vi: 'Xin lỗi, tôi không thể xử lý yêu cầu này vì nó chứa nội dung không hợp lệ.'
  },
  prompt_injection: {
    en: 'I apologize, but I need to stop here as the response would contain restricted content. Is there something else I can help you with?',
    vi: 'Xin lỗi, tôi cần dừng lại vì câu trả lời sẽ chứa nội dung bị hạn chế. Tôi có thể giúp gì khác không?'
  },
  general_error: {
    en: 'Sorry, I encountered an error processing your request.',
    vi: 'Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu của bạn.'
  },
  overloaded: {
    en: 'Claude API is currently experiencing high traffic. Please try again in a few moments.',
    vi: 'Hệ thống đang tải cao. Vui lòng thử lại sau vài phút.'
  },
  rate_limit: {
    en: 'Rate limit exceeded. Please try again later.',
    vi: 'Đã vượt quá giới hạn yêu cầu. Vui lòng thử lại sau.'
  },
  auth_error: {
    en: 'Authentication error. Please check your API key configuration.',
    vi: 'Lỗi xác thực. Vui lòng kiểm tra cấu hình API key.'
  },
  bad_request: {
    en: 'Sorry, there was an error processing your request. The input may be too long or contain unsupported content.',
    vi: 'Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu. Đầu vào có thể quá dài hoặc chứa nội dung không được hỗ trợ.'
  }
};

// Socket.IO connection handler
io.on('connection', (socket: Socket) => {
  console.log('A user connected:', socket.id);

  // Handle legal document requests
  socket.on('get-legal-document', (documentType: string) => {
    handleLegalDocumentRequest(socket, documentType);
  });

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

      // Validate and sanitize incoming message
      try {
        contentSafetyService.validateContent(message);
        message = contentSafetyService.sanitizeContent(message);
      } catch (error) {
        if (error instanceof ContentSafetyError) {
          socket.emit('bot-response', {
            text: error.code === 'restricted_topic' 
              ? ERROR_MESSAGES.restricted_content[error.language]
              : ERROR_MESSAGES.invalid_content[error.language],
            id: Date.now().toString(),
          });
          return;
        }
        throw error;
      }
      
      // Generate a unique message ID for this response
      const messageId = Date.now().toString();
      
      // Let the client know we're starting a response
      socket.emit('bot-response-start', { id: messageId });

      let responseBuffer = '';
      
      // Check if MCP client is connected and use it if available
      if (mcpClient && mcpConnected) {
        // Process message using MCP client with streaming callback
        await mcpClient.processQueryWithStreaming(message, (chunk) => {
          try {
            // Validate each chunk before sending
            contentSafetyService.validateResponse(responseBuffer + chunk, 'vi');
            responseBuffer += chunk;
            
            socket.emit('bot-response-chunk', {
              id: messageId,
              text: chunk
            });
          } catch (error) {
            if (error instanceof ContentSafetyError) {
              socket.emit('bot-response', {
                text: ERROR_MESSAGES.prompt_injection[error.language],
                id: messageId,
              });
              throw error; // This will stop the streaming
            }
            throw error;
          }
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
            try {
              // Validate each chunk before sending
              contentSafetyService.validateResponse(responseBuffer + chunk.delta.text, 'vi');
              responseBuffer += chunk.delta.text;
              
              socket.emit('bot-response-chunk', {
                id: messageId,
                text: chunk.delta.text
              });
            } catch (error) {
              if (error instanceof ContentSafetyError) {
                socket.emit('bot-response', {
                  text: ERROR_MESSAGES.prompt_injection[error.language],
                  id: messageId,
                });
                break;
              }
              throw error;
            }
          }
        }
      }

      // Signal that the response is complete
      socket.emit('bot-response-end', { id: messageId });
    } catch (error: any) {
      console.error('Error processing message:', error);
      
      // Generate a unique message ID for the error response
      const errorId = Date.now().toString();
      
      const language = error instanceof ContentSafetyError ? error.language : 'en';
      let errorMessage = ERROR_MESSAGES.general_error[language];
      
      // Check for specific Claude API errors
      if (error?.status === 529 || (error?.error?.type === "overloaded_error")) {
        errorMessage = ERROR_MESSAGES.overloaded[language];
      } else if (error?.status === 400) {
        errorMessage = ERROR_MESSAGES.bad_request[language];
      } else if (error?.status === 401) {
        errorMessage = ERROR_MESSAGES.auth_error[language];
      } else if (error?.status === 429) {
        errorMessage = ERROR_MESSAGES.rate_limit[language];
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 