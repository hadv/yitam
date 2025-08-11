import express, { Express } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { MCPClient } from './MCPClient';
import { config } from './config';
import { sampleQuestions } from './data/SampleQuestions';
import { contentSafetyService } from './services/ContentSafety';
import { ContentSafetyError } from './utils/errors';
import { LegalService } from './services/LegalService';
import { handleLegalDocumentRequest } from './routes/legal';
import { validateAccessCode } from './middleware/AccessControl';
import { verifyRequestSignature } from './utils/crypto';
import { initializeDatabase } from './db/database';
import { initializeQigongDatabase, seedAcupointPositions } from './db/qigongDatabase';
import conversationRoutes from './routes/conversations';
import adminRoutes from './routes/admin';
import CacheFactory from './cache/CacheFactory';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
app.use(cors(config.server.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply access control middleware only to specific routes that need it
// Most conversation management should be available to authenticated users
app.use((req, res, next) => {
  // Skip access code validation for:
  // - Health check
  // - Viewing shared conversations (public) - both /shared/ and /api/conversations/shared/
  // - All conversation management (sharing, unsharing, etc.) - users manage their own conversations
  // - Admin routes (they have their own access control)
  // - Uploaded images (public access for image display)
  if (req.path === '/health' ||
      req.path.startsWith('/api/conversations/') ||
      req.path.startsWith('/api/admin/') ||
      req.path.startsWith('/shared/') ||
      req.path.startsWith('/uploads/') ||
      req.path === '/qigong') {
    return next();
  }

  // Only require access codes for other sensitive operations
  validateAccessCode(req, res, next);
});

// Add conversation sharing routes (public access)
app.use('/api/conversations', conversationRoutes);

// Serve uploaded images statically (public access for image display)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve test files (for debugging)
app.use(express.static(path.join(__dirname, '../../')));

// Add admin routes (requires admin access code)
app.use('/api/admin', adminRoutes);

// Add public route for shared conversations (serves frontend)
app.get('/shared/:shareId', (req, res) => {
  // Serve a simple HTML page that loads the frontend React app
  // The React router will handle the /shared/:shareId route
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Shared Conversation - Yitam</title>
      <style>
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          background: #f5f5f5;
        }
        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          flex-direction: column;
        }
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #5D4A38;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="loading">
        <div class="spinner"></div>
        <p style="margin-top: 20px; color: #5D4A38;">Loading shared conversation...</p>
      </div>
      <script>
        // Redirect to the frontend application
        const clientUrl = '${process.env.CLIENT_URL || 'http://localhost:3001'}';
        window.location.href = clientUrl + '/shared/${req.params.shareId}';
      </script>
    </body>
    </html>
  `);
});

// Add qigong page route (serves frontend)
app.get('/qigong', (req, res) => {
  // Serve a simple HTML page that loads the frontend React app
  // The React router will handle the /qigong route
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Qigong Management - Yitam</title>
      <style>
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          background: #f5f5f5;
        }
        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          flex-direction: column;
        }
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #5D4A38;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="loading">
        <div class="spinner"></div>
        <p style="margin-top: 20px; color: #5D4A38;">Loading qigong management...</p>
      </div>
      <script>
        // Redirect to the frontend application
        const clientUrl = '${process.env.CLIENT_URL || 'http://localhost:3001'}';
        const urlParams = new URLSearchParams(window.location.search);
        const accessCode = urlParams.get('access_code');
        const qigongUrl = clientUrl + '/qigong' + (accessCode ? '?access_code=' + encodeURIComponent(accessCode) : '');
        window.location.href = qigongUrl;
      </script>
    </body>
    </html>
  `);
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

// Add Socket.IO middleware for Google authentication
io.use((socket, next) => {
  const userEmail = socket.handshake.headers['x-user-email'] as string;
  const userName = socket.handshake.headers['x-user-name'] as string;
  const apiKey = socket.handshake.headers['x-api-key'] as string;
  
  if (!userEmail || !userName) {
    return next(new Error('User authentication required'));
  }

  // Allow connection without API key initially
  socket.data.user = { email: userEmail, name: userName };
  
  // If API key is provided, validate and store it
  if (apiKey) {
    socket.data.user.apiKey = apiKey;
  }
  
  next();
});

// Initialize services
const legalService = LegalService.getInstance();

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
  },
  credit_balance: {
    en: 'Your Anthropic API credit balance is too low. Please visit Plans & Billing to upgrade or purchase more credits.',
    vi: 'Số dư tín dụng API Anthropic của bạn quá thấp. Vui lòng truy cập Kế hoạch & Thanh toán để nâng cấp hoặc mua thêm tín dụng.'
  }
};

// Socket.IO connection handler
io.on('connection', (socket: Socket) => {
  console.log('A user connected:', socket.id);

  // Initialize Anthropic client only when API key is available
  let anthropic: Anthropic | null = null;
  if (socket.data.user.apiKey) {
    anthropic = new Anthropic({
      apiKey: socket.data.user.apiKey,
    });
  }

  // Handle API key updates
  socket.on('update-api-key', (apiKey: string) => {
    socket.data.user.apiKey = apiKey;
    anthropic = new Anthropic({
      apiKey: apiKey,
    });
  });

  // Initialize MCP client for this connection if needed
  let mcpClient: MCPClient | null = null;
  let mcpConnected = false;

  // Only try to connect to MCP if path is provided and not empty and API key is available
  if (process.env.MCP_SERVER_PATH && process.env.MCP_SERVER_PATH.trim() !== '' && socket.data.user.apiKey) {
    mcpClient = new MCPClient(socket.data.user.apiKey);
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
    console.log('No MCP server path provided or API key not available, using direct Claude API when key is provided');
  }

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

  // Get available personas when requested
  socket.on('get-personas', () => {
    console.log('Available personas requested');
    
    if (mcpClient && mcpConnected) {
      const personas = mcpClient.getAvailablePersonas();
      socket.emit('available-personas', personas);
    } else {
      socket.emit('available-personas', []);
    }
  });

  // Handle chat messages
  socket.on('chat-message', async (data: { message: string; personaId?: string }) => {
    try {
      const userMessage = data.message;
      const personaId = data.personaId;
      
      console.log('Received message:', userMessage);
      if (personaId) {
        console.log('Using persona:', personaId);
      }

      // Check if API key is available
      if (!socket.data.user.apiKey) {
        socket.emit('error', {
          type: 'auth_error',
          message: ERROR_MESSAGES.auth_error.vi
        });
        return;
      }

      // Initialize Anthropic client if not already initialized
      if (!anthropic) {
        anthropic = new Anthropic({
          apiKey: socket.data.user.apiKey,
        });
      }
      
      const startTime = Date.now();
      
      // Only enable AI safety if explicitly turned on in environment
      const enableAiSafety = process.env.ENABLE_AI_CONTENT_SAFETY === 'true';
      
      // Initialize content safety service with client's API key
      if (enableAiSafety) {
        contentSafetyService.initializeAiClient(socket.data.user.apiKey);
        contentSafetyService.enableAiContentSafety(true);
        console.log('AI-based content safety check enabled with client API key');
      } else {
        contentSafetyService.enableAiContentSafety(false);
        console.log('AI-based content safety check disabled');
      }

      // Validate and sanitize incoming message
      let sanitizedMessage = userMessage;
      try {
        await contentSafetyService.validateContent(userMessage);
        sanitizedMessage = contentSafetyService.sanitizeContent(userMessage);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('credit balance is too low')) {
            socket.emit('error', {
              type: 'credit_balance',
              message: ERROR_MESSAGES.credit_balance.vi
            });
            return;
          }
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
          await mcpClient.processQueryWithStreaming(
            sanitizedMessage, 
            async (chunk) => {
              try {
                // Use different validation based on whether AI safety is enabled
                if (enableAiSafety) {
                  // Full AI-based validation
                  await contentSafetyService.validateResponse(responseBuffer + chunk, 'vi');
                } else {
                  // Fast prompt injection check only
                  const isSafe = contentSafetyService.checkPromptInjectionOnly(responseBuffer + chunk, 'vi');
                  if (!isSafe) {
                    console.log(`Content safety error detected in AI response - prompt injection attempt`);
                    safetyErrorOccurred = true;
                    socket.emit('bot-response-end', { 
                      id: messageId,
                      error: true, 
                      errorMessage: ERROR_MESSAGES.prompt_injection['vi']
                    });
                    return false; // Stop streaming
                  }
                }
                
                // Update the buffer with this chunk
                responseBuffer += chunk;
                
                // Emit the response chunk to the client
                socket.emit('bot-response-chunk', {
                  id: messageId,
                  text: chunk,
                });
                
                return true; // Continue streaming
              } catch (error) {
                if (error instanceof ContentSafetyError) {
                  console.log(`Content safety error detected in AI response: ${error.message}, code: ${error.code}`);
                  safetyErrorOccurred = true;
                  
                  // Get appropriate error message based on the error code
                  let errorMessage = ERROR_MESSAGES.invalid_content[error.language];
                  
                  // Use more specific error messages when available
                  if (error.code === 'medical_advice' || error.code === 'financial_advice' || 
                      error.code === 'legal_advice' || error.code === 'product_marketing') {
                    errorMessage = ERROR_MESSAGES.restricted_content[error.language];
                  } else if (error.code === 'prompt_injection') {
                    errorMessage = ERROR_MESSAGES.prompt_injection[error.language];
                  }
                  
                  socket.emit('bot-response-end', { 
                    id: messageId,
                    error: true, 
                    errorMessage
                  });
                  
                  return false; // Stop streaming
                } else {
                  console.error('Error validating content during streaming response:', error);
                  throw error;
                }
              }
            },
            undefined, // Use default chat ID
            personaId // Pass persona ID if provided
          );
          
          // Clear the timeout since we got a response
          clearTimeout(toolCallTimeout);
          
          // If no safety error occurred, finalize the response
          if (!safetyErrorOccurred) {
            socket.emit('bot-response-end', { 
              id: messageId,
              text: responseBuffer,
              responseTime: Date.now() - startTime
            });
          }
        } catch (err) {
          console.error('Error with MCP client:', err);
          clearTimeout(toolCallTimeout);
          
          // Check for rate limit errors
          const isRateLimitError = err instanceof Error && 
            (err.message.includes('rate limit') || 
             (err as any)?.type === 'rate_limit_error' ||
             err.message.includes('429'));
          
          if (isRateLimitError) {
            // For rate limit errors, emit the specific error event
            socket.emit('bot-response-error', { 
              id: messageId,
              error: {
                type: 'rate_limit_error',
                message: 'Rate limit exceeded'
              }
            });
          } else {
            // Send appropriate error message to client
            let errorMessage = ERROR_MESSAGES.general_error.vi;
            if (err instanceof Error && err.message.includes('overloaded')) {
              errorMessage = ERROR_MESSAGES.overloaded.vi;
            }
            
            socket.emit('bot-response-end', { 
              id: messageId,
              error: true, 
              errorMessage
            });
          }
        }
      } else {
        try {
          // Use direct Anthropic API since MCP is not available
          const stream = await anthropic.messages.stream({
            model: config.model.name,
            max_tokens: Math.min(config.model.maxTokens, config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 4000),
            messages: [
              { role: 'user', content: sanitizedMessage }
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
                    console.log(`Content safety error detected in AI response - prompt injection attempt`);
                    safetyErrorOccurred = true;
                    socket.emit('bot-response-end', { 
                      id: messageId,
                      error: true, 
                      errorMessage: ERROR_MESSAGES.prompt_injection['vi']
                    });
                    break; // Stop processing
                  }
                }
                
                // Update the buffer with this chunk
                responseBuffer += chunk.delta.text;
                
                // Emit the response chunk to the client
                socket.emit('bot-response-chunk', {
                  id: messageId,
                  text: chunk.delta.text,
                });
              } catch (error) {
                if (error instanceof ContentSafetyError) {
                  console.log(`Content safety error detected in AI response: ${error.message}, code: ${error.code}`);
                  safetyErrorOccurred = true;
                  
                  // Get appropriate error message based on the error code
                  let errorMessage = ERROR_MESSAGES.invalid_content[error.language];
                  
                  // Use more specific error messages when available
                  if (error.code === 'medical_advice' || error.code === 'financial_advice' || 
                      error.code === 'legal_advice' || error.code === 'product_marketing') {
                    errorMessage = ERROR_MESSAGES.restricted_content[error.language];
                  } else if (error.code === 'prompt_injection') {
                    errorMessage = ERROR_MESSAGES.prompt_injection[error.language];
                  }
                  
                  socket.emit('bot-response-end', { 
                    id: messageId,
                    error: true, 
                    errorMessage
                  });
                  
                  break; // Stop processing
                } else {
                  console.error('Error validating content during streaming response:', error);
                  throw error;
                }
              }
            }
          }
          
          // If no safety error occurred, signal that the streaming has completed
          if (!safetyErrorOccurred) {
            socket.emit('bot-response-end', { 
              id: messageId,
              text: responseBuffer,
              responseTime: Date.now() - startTime
            });
          }
          
          clearTimeout(toolCallTimeout);
        } catch (error) {
          console.error('Error processing stream through Anthropic API:', error);
          clearTimeout(toolCallTimeout);
          
          // Check for rate limit errors
          const isRateLimitError = error instanceof Error && 
            (error.message.includes('rate limit') || 
             (error as any)?.type === 'rate_limit_error' ||
             error.message.includes('429'));
          
          if (isRateLimitError) {
            // For rate limit errors, emit the specific error event
            socket.emit('bot-response-error', { 
              id: messageId,
              error: {
                type: 'rate_limit_error',
                message: 'Rate limit exceeded'
              }
            });
          } else {
            // General error handling
            socket.emit('bot-response-end', { 
              id: messageId,
              error: true, 
              errorMessage: ERROR_MESSAGES.general_error.vi
            });
          }
        }
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

  // Handle title generation request
  socket.on('generate-title', async (data: { conversation: string; topicId: number }) => {
    try {
      console.log(`Title generation requested for topic ${data.topicId}`);
      
      // Check if API key is available
      if (!socket.data.user.apiKey || !anthropic) {
        console.error('Cannot generate title: API key missing or Anthropic client not initialized');
        socket.emit('title-generation-error', { 
          message: 'API key missing or not initialized',
          topicId: data.topicId 
        });
        return;
      }
      
      // Check if conversation is too short
      if (!data.conversation || data.conversation.length < 20) {
        console.error('Conversation too short for title generation');
        socket.emit('title-generation-error', { 
          message: 'Conversation too short for title generation',
          topicId: data.topicId 
        });
        return;
      }
      
      // Prepare the prompt for title generation
      const prompt = `Dưới đây là một đoạn hội thoại. Hãy tạo một tiêu đề ngắn gọn (không quá 50 ký tự) mô tả nội dung chính của cuộc trò chuyện này. Tiêu đề phải bằng tiếng Việt, có ý nghĩa và dễ hiểu.

Hội thoại:
${data.conversation}

Tiêu đề:`;
      
      // Use Anthropic API to generate the title
      try {
        console.log(`Sending title generation request to Claude API for topic ${data.topicId}`);
        const response = await anthropic.messages.create({
          model: config.model.name,
          max_tokens: 100,
          messages: [
            { role: 'user', content: prompt }
          ],
        });
        
        // Extract and clean up the generated title
        let title = "";
        if (response.content && response.content.length > 0) {
          const contentBlock = response.content[0];
          if (contentBlock.type === 'text') {
            title = contentBlock.text.trim();
          }
        }
        
        // Handle empty response
        if (!title) {
          console.error('Claude returned empty title content');
          socket.emit('title-generation-error', { 
            message: 'Empty title generated',
            topicId: data.topicId 
          });
          // Use a fallback title
          socket.emit('title-generation-success', {
            title: "New Conversation",
            topicId: data.topicId
          });
          return;
        }
        
        // Remove quotes if present
        if (title.startsWith('"') && title.endsWith('"')) {
          title = title.substring(1, title.length - 1);
        }
        
        // Limit title length if necessary
        if (title.length > 100) {
          title = title.substring(0, 97) + '...';
        }
        
        console.log(`Generated title: "${title}" for topic ${data.topicId}`);
        
        // Emit success event with the generated title
        socket.emit('title-generation-success', {
          title,
          topicId: data.topicId
        });
      } catch (error) {
        console.error('Error generating title with Claude API:', error);
        socket.emit('title-generation-error', { 
          message: 'Error generating title with API',
          topicId: data.topicId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Use a fallback title
        socket.emit('title-generation-success', {
          title: "New Conversation",
          topicId: data.topicId
        });
      }
    } catch (error) {
      console.error('Error in title generation handler:', error);
      socket.emit('title-generation-error', { 
        message: 'Server error in title generation',
        topicId: data.topicId 
      });
      // Use a fallback title
      socket.emit('title-generation-success', {
        title: "New Conversation",
        topicId: data.topicId
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

// Initialize databases and cache, then start the server
Promise.all([
  initializeDatabase(),
  initializeQigongDatabase(),
  CacheFactory.createCache()
])
  .then(([, , cache]) => {
    const cacheInfo = CacheFactory.getCacheInfo();
    console.log('Databases and cache initialized successfully');

    // Seed acupoint positions after database initialization
    seedAcupointPositions();
    console.log(`Cache type: ${cacheInfo.type} (${cacheInfo.environment} environment)`);

    // Start the server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Cache status: ${cache.isAvailable() ? 'Available' : 'Unavailable'} (${cacheInfo.type})`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize services:', error);
    // Start server anyway with degraded functionality
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (degraded mode - no cache)`);
    });
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  const cache = CacheFactory.getInstance();
  if (cache) {
    await cache.disconnect();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  const cache = CacheFactory.getInstance();
  if (cache) {
    await cache.disconnect();
  }
  process.exit(0);
});