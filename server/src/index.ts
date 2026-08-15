import express, { Express } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getResponseText } from './utils/anthropicResponse';
import { MCPClient } from './MCPClient.js';
import { config } from './config';
import { sampleQuestions } from './data/SampleQuestions';
import { contentSafetyService } from './services/ContentSafety';
import { LegalService } from './services/LegalService';
import { handleLegalDocumentRequest } from './routes/legal';
import { validateAccessCode } from './middleware/AccessControl';
import { verifyRequestSignature } from './utils/crypto';
import { initializeDatabase } from './db/database';
import { initializeQigongDatabase } from './db/qigongDatabase';
import conversationRoutes from './routes/conversations';
import adminRoutes from './routes/admin';
import CacheFactory from './cache/CacheFactory';
import { ContextEngine } from './services/ContextEngine';
import { ChatTurnOrchestrator, ContextMessage } from './services/ChatTurnOrchestrator';
import { ChatTurnDispatcher } from './services/ChatTurnDispatcher';
import { ContentSafetyPolicy } from './services/ContentSafetyPolicy';
import { DirectAnthropicAdapter } from './services/DirectAnthropicAdapter';
import { MCPTransportAdapter } from './services/MCPTransportAdapter';
import { getContextConfig } from './config/contextEngine';

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

// Initialize Context Engine
let contextEngine: ContextEngine | null = null;
const chatTurnOrchestrator = new ChatTurnOrchestrator();

/**
 * The transcript for one turn.
 *
 * With a context engine, the turn is recorded and the engine answers with a window
 * around it: recent messages, relevant history, and whatever it has summarised —
 * carried as `system` entries, which the direct transport turns into a system
 * prompt and the MCP transport drops. Without an engine, the transcript is the
 * message on its own.
 */
async function buildTurnContext(
  chatId: string,
  userEmail: string,
  sanitizedInput: string
): Promise<ContextMessage[]> {
  const asked: ContextMessage[] = [{ role: 'user', content: sanitizedInput }];

  if (!contextEngine) {
    return asked;
  }

  await contextEngine.createConversation(chatId, userEmail);
  await contextEngine.addMessage(chatId, Date.now(), { role: 'user', content: sanitizedInput });

  const window = await contextEngine.getOptimizedContext(chatId, sanitizedInput);

  const transcript: ContextMessage[] = [...window.recentMessages, ...window.relevantHistory]
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .filter(message => typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content as string
    }));

  const preamble: ContextMessage[] = [];
  if (window.summaries.length > 0) {
    preamble.push({
      role: 'system',
      content: `Previous conversation context:\n${window.summaries.map(s => s.summary).join('\n')}`
    });
  }
  if (window.keyFacts.length > 0) {
    preamble.push({
      role: 'system',
      content: `Key facts from conversation:\n${window.keyFacts.map(f => f.factText).join('\n')}`
    });
  }
  if (preamble.length > 0) {
    preamble.push({ role: 'system', content: 'Please respond naturally while being aware of this context.' });
  }

  console.log(
    `Context optimization: ${transcript.length} messages, ${window.totalTokens} tokens, ` +
    `${(window.compressionRatio * 100).toFixed(1)}% compression`
  );

  // An empty window means this is the first thing said.
  return [...preamble, ...(transcript.length > 0 ? transcript : asked)];
}
const initializeContextEngine = async (): Promise<void> => {
  if (process.env.CONTEXT_ENGINE_ENABLED === 'true') {
    try {
      const contextConfig = getContextConfig();
      contextEngine = new ContextEngine(contextConfig.contextEngine);
      await contextEngine.initialize();
      console.log('Context Engine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Context Engine:', error);
      console.log('Continuing without Context Engine - using direct Anthropic API');
    }
  } else {
    console.log('Context Engine disabled - using direct Anthropic API');
  }
};

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
  socket.on('chat-message', async (data: { message: string; personaId?: string; chatId?: string }) => {
    const messageId = Date.now().toString();

    try {
      const userMessage = data.message;
      const personaId = data.personaId;
      // Use provided chatId or generate a session-based one
      const chatId = data.chatId || `${socket.data.user.email}_${socket.id}`;

      console.log('Received message:', userMessage);
      if (personaId) {
        console.log('Using persona:', personaId);
      }
      console.log('Chat ID:', chatId);

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

      const transport = mcpClient && mcpConnected
        ? new MCPTransportAdapter(mcpClient, chatId)
        : new DirectAnthropicAdapter(anthropic, {
            model: config.model.name,
            maxTokens: Math.min(
              config.model.maxTokens,
              config.model.tokenLimits?.[config.model.name] || config.model.tokenLimits?.default || 4000
            ),
          });

      // Deferred: the context store records this turn, and what it records has to
      // be the message as the safety policy left it, not as it arrived.
      const context = (sanitized: string) => buildTurnContext(chatId, socket.data.user.email, sanitized);

      const dispatcher = new ChatTurnDispatcher({
        orchestrator: chatTurnOrchestrator,
        safetyPolicy: new ContentSafetyPolicy(contentSafetyService),
        errorMessages: ERROR_MESSAGES,
        enableAiSafety,
        language: 'vi',
        onCompleted: async fullResponse => {
          if (contextEngine && fullResponse) {
            await contextEngine.addMessage(chatId, Date.now() + 1, {
              role: 'assistant',
              content: fullResponse
            });
          }
        }
      });

      await dispatcher.run(socket, { input: userMessage, chatId, personaId, messageId, context }, transport);
    } catch (error: any) {
      // Anything that got past the dispatcher: building the context, or the
      // context engine falling over. The turn has already been announced, so the
      // failure belongs on the pending reply rather than in a message of its own.
      console.error('Error processing message:', error);

      socket.emit('bot-response-error', {
        id: messageId,
        error: {
          type: 'general',
          error: { message: ERROR_MESSAGES.general_error.vi }
        }
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
          // Haiku 4.5: titling is short and mechanical, and Haiku leaves
          // thinking off by default, so the small token limit stays sufficient.
          model: "claude-haiku-4-5",
          max_tokens: 100,
          messages: [
            { role: 'user', content: prompt }
          ],
        });
        
        // Extract and clean up the generated title
        let title = "";
        if (response.content && response.content.length > 0) {
          title = (getResponseText(response) ?? '').trim();
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

// Initialize databases, cache, and context engine, then start the server
Promise.all([
  initializeDatabase(),
  initializeQigongDatabase(),
  CacheFactory.createCache(),
  initializeContextEngine()
])
  .then(([, , cache]) => {
    const cacheInfo = CacheFactory.getCacheInfo();
    console.log('Databases, cache, and context engine initialized successfully');
    console.log(`Cache type: ${cacheInfo.type} (${cacheInfo.environment} environment)`);
    console.log(`Context Engine: ${contextEngine ? 'Enabled' : 'Disabled'}`);

    // Start the server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Cache status: ${cache.isAvailable() ? 'Available' : 'Unavailable'} (${cacheInfo.type})`);
      console.log(`Context Engine status: ${contextEngine ? 'Active' : 'Inactive'}`);
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