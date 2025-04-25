import express, { Express } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { MCPClient } from './MCPClient';
import { config } from './config';
import { sampleQuestions } from './data/sampleQuestions';
import { contentSafetyService } from './services/ContentSafety';
import { ContentSafetyError } from './utils/errors';
import { LegalService } from './services/legalService';
import { handleLegalDocumentRequest } from './routes/legal';
import { validateAccessCode } from './middleware/accessControl';
import { verifyRequestSignature } from './utils/crypto';

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
  cors: {
    origin: config.server.cors.origin,
    methods: config.server.cors.methods,
    credentials: config.server.cors.credentials,
    allowedHeaders: config.server.cors.allowedHeaders
  },
  allowEIO3: true,
  transports: ['polling', 'websocket'],
  pingTimeout: 60000, // Increase ping timeout to 60 seconds
  pingInterval: 25000, // Set ping interval to 25 seconds
  connectTimeout: 45000 // Increase connection timeout to 45 seconds
});

// Add Socket.IO middleware for access code validation
io.use((socket, next) => {
  const accessCode = socket.handshake.headers['x-access-code'] as string;
  
  if (!accessCode) {
    return next(new Error('Access code is required'));
  }
  
  const validAccessCodes = process.env.VALID_ACCESS_CODES?.split(',') || [];
  
  if (!validAccessCodes.includes(accessCode)) {
    return next(new Error('Invalid access code'));
  }

  // Verify request signature if enabled
  if (process.env.ENABLE_SIGNATURE_VERIFICATION === 'true') {
    const signature = socket.handshake.headers['x-request-signature'] as string;
    const timestamp = socket.handshake.headers['x-request-timestamp'] as string;
    
    if (!signature || !timestamp) {
      return next(new Error('Request signature required'));
    }
    
    if (!verifyRequestSignature(accessCode, signature, timestamp)) {
      return next(new Error('Invalid request signature'));
    }
  }
  
  // Store the access code in the socket object for later use
  socket.data.accessCode = accessCode;
  next();
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
      const startTime = Date.now();
      
      // Only enable AI safety if explicitly turned on in environment
      const enableAiSafety = process.env.ENABLE_AI_CONTENT_SAFETY === 'true';
      
      // Validate and sanitize incoming message
      try {
        // Only do AI validation if explicitly enabled
        if (enableAiSafety && !contentSafetyService.isAiContentSafetyEnabled()) {
          contentSafetyService.enableAiContentSafety(true);
          console.log('AI-based content safety check enabled');
        } else if (!enableAiSafety && contentSafetyService.isAiContentSafetyEnabled()) {
          contentSafetyService.enableAiContentSafety(false);
          console.log('AI-based content safety check disabled');
        }

        await contentSafetyService.validateContent(message);
        message = contentSafetyService.sanitizeContent(message);
      } catch (error) {
        if (error instanceof ContentSafetyError) {
          console.log(`Content safety error detected in user input: ${error.message}, code: ${error.code}`);
          
          // Get appropriate error message based on the error code
          let errorMessage = ERROR_MESSAGES.invalid_content[error.language];
          
          // Use more specific error messages when available
          if (error.code === 'medical_advice' || error.code === 'financial_advice' || 
              error.code === 'legal_advice' || error.code === 'product_marketing') {
            errorMessage = ERROR_MESSAGES.restricted_content[error.language];
          } else if (error.code === 'prompt_injection') {
            errorMessage = ERROR_MESSAGES.prompt_injection[error.language];
          }
          
          socket.emit('bot-response', {
            text: errorMessage,
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

      // Set a timeout for the MCP tool call
      const toolCallTimeout = setTimeout(() => {
        if (!socket.disconnected) {
          console.log('Tool call taking too long, sending timeout notification to client');
          socket.emit('tool-call-timeout', { id: messageId });
        }
      }, 60000); // 60 second timeout (increased from 30 seconds)

      let responseBuffer = '';
      // Flag to track if a content safety error occurred
      let safetyErrorOccurred = false;
      
      // Check if MCP client is connected and use it if available
      if (mcpClient && mcpConnected) {
        try {
          // Process message using MCP client with streaming callback
          await mcpClient.processQueryWithStreaming(message, async (chunk) => {
            try {
              // Use different validation based on whether AI safety is enabled
              if (enableAiSafety) {
                // Full AI-based validation
                await contentSafetyService.validateResponse(responseBuffer + chunk, 'vi');
              } else {
                // Fast prompt injection check only
                const isSafe = contentSafetyService.checkPromptInjectionOnly(responseBuffer + chunk, 'vi');
                if (!isSafe) {
                  throw new ContentSafetyError(
                    "Content contains prompt injection attempt",
                    "prompt_injection",
                    "vi"
                  );
                }
              }
              
              responseBuffer += chunk;
              
              // Only emit if socket is still connected
              if (!socket.disconnected) {
                socket.emit('bot-response-chunk', {
                  id: messageId,
                  text: chunk
                });
              }
              return true; // Continue streaming
            } catch (error) {
              if (error instanceof ContentSafetyError) {
                safetyErrorOccurred = true;
                console.log(`Content safety error in response chunk: ${error.message}, code: ${error.code}`);
                console.log(`Original content that triggered the safety error: "${responseBuffer + chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}"`);
                
                if (!socket.disconnected) {
                  // Send a clear error response to the client
                  socket.emit('bot-response', {
                    text: ERROR_MESSAGES.prompt_injection[error.language],
                    id: messageId,
                  });
                  
                  // Also emit a specific content safety error event
                  socket.emit('content-safety-error', {
                    id: messageId,
                    error: error.message,
                    code: error.code
                  });
                  
                  // Make sure to send the end signal to let client know we're done
                  socket.emit('bot-response-end', { 
                    id: messageId,
                    error: true,
                    errorType: 'content_safety',
                    errorCode: error.code
                  });
                }
                return false; // Signal to stop streaming
              }
              throw error;
            }
          });
          
          // Clear the timeout if the tool call completes successfully
          clearTimeout(toolCallTimeout);
        } catch (error) {
          // Clear the timeout in case of error
          clearTimeout(toolCallTimeout);
          console.error('Error with MCP client during tool call:', error);
          
          // If there was a timeout or connection issue, try to fall back to direct API
          if (!socket.disconnected) {
            socket.emit('tool-call-error', { 
              id: messageId,
              error: 'Tool call failed, falling back to direct API'
            });
            
            // Attempt fallback to direct API
            try {
              const stream = await anthropic.messages.stream({
                model: config.model.name,
                max_tokens: Math.min(config.model.maxTokens, config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 4000),
                messages: [
                  { role: 'user', content: message }
                ],
              });
              
              // Reset response buffer for the fallback
              responseBuffer = '';
              
              for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                  try {
                    // Validate each chunk before sending
                    await contentSafetyService.validateResponse(responseBuffer + chunk.delta.text, 'vi');
                    responseBuffer += chunk.delta.text;
                    
                    if (!socket.disconnected) {
                      socket.emit('bot-response-chunk', {
                        id: messageId,
                        text: chunk.delta.text
                      });
                    }
                  } catch (error) {
                    if (error instanceof ContentSafetyError) {
                      safetyErrorOccurred = true;
                      console.log(`Content safety error in fallback response: ${error.message}, code: ${error.code}`);
                      console.log(`Original content that triggered the safety error: "${responseBuffer + chunk.delta.text.substring(0, 50)}${chunk.delta.text.length > 50 ? '...' : ''}"`);
                      
                      if (!socket.disconnected) {
                        socket.emit('bot-response', {
                          text: ERROR_MESSAGES.prompt_injection[error.language],
                          id: messageId,
                        });
                        
                        // Also emit a specific content safety error event
                        socket.emit('content-safety-error', {
                          id: messageId,
                          error: error.message,
                          code: error.code
                        });
                        
                        // Make sure to send the end signal to let client know we're done
                        socket.emit('bot-response-end', { 
                          id: messageId,
                          error: true,
                          errorType: 'content_safety',
                          errorCode: error.code
                        });
                      }
                      break; // Stop processing the stream
                    }
                    throw error;
                  }
                }
              }
            } catch (fallbackError) {
              console.error('Fallback to direct API also failed:', fallbackError);
              throw fallbackError; // Let the outer catch handle this
            }
          }
        }
      } else {
        // Fallback to direct Claude API with streaming
        try {
          const stream = await anthropic.messages.stream({
            model: config.model.name,
            max_tokens: Math.min(config.model.maxTokens, config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 4000),
            messages: [
              { role: 'user', content: message }
            ],
          });

          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              try {
                // Use different validation based on whether AI safety is enabled
                if (enableAiSafety) {
                  // Full AI-based validation
                  await contentSafetyService.validateResponse(responseBuffer + chunk.delta.text, 'vi');
                } else {
                  // Fast prompt injection check only
                  const isSafe = contentSafetyService.checkPromptInjectionOnly(responseBuffer + chunk.delta.text, 'vi');
                  if (!isSafe) {
                    throw new ContentSafetyError(
                      "Content contains prompt injection attempt",
                      "prompt_injection",
                      "vi"
                    );
                  }
                }
                
                responseBuffer += chunk.delta.text;
                
                if (!socket.disconnected) {
                  socket.emit('bot-response-chunk', {
                    id: messageId,
                    text: chunk.delta.text
                  });
                }
              } catch (error) {
                if (error instanceof ContentSafetyError) {
                  safetyErrorOccurred = true;
                  console.log(`Content safety error in direct API response: ${error.message}, code: ${error.code}`);
                  console.log(`Original content that triggered the safety error: "${responseBuffer + chunk.delta.text.substring(0, 50)}${chunk.delta.text.length > 50 ? '...' : ''}"`);
                  
                  if (!socket.disconnected) {
                    socket.emit('bot-response', {
                      text: ERROR_MESSAGES.prompt_injection[error.language],
                      id: messageId,
                    });
                    
                    // Also emit a specific content safety error event
                    socket.emit('content-safety-error', {
                      id: messageId,
                      error: error.message,
                      code: error.code
                    });
                    
                    // Make sure to send the end signal to let client know we're done
                    socket.emit('bot-response-end', { 
                      id: messageId,
                      error: true,
                      errorType: 'content_safety',
                      errorCode: error.code
                    });
                  }
                  break; // Stop processing the stream
                }
                throw error;
              }
            }
          }
          
          // Clear the timeout as we're done with the direct API call
          clearTimeout(toolCallTimeout);
        } catch (error) {
          // Clear the timeout in case of error
          clearTimeout(toolCallTimeout);
          throw error;
        }
      }

      // Signal that the response is complete only if no safety error occurred
      if (!socket.disconnected && !safetyErrorOccurred) {
        socket.emit('bot-response-end', { id: messageId });
        const responseTime = Date.now() - startTime;
        console.log(`Total response time: ${responseTime}ms`);
      }
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