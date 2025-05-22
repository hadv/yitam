import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../../config';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { TailwindAuth } from './TailwindAuth';
import { TailwindApiKeySettings } from './TailwindApiKeySettings';
import TailwindChatBox from './TailwindChatBox';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindTermsModal from './TailwindTermsModal';
import TailwindPersonaSelector from './TailwindPersonaSelector';
import TailwindToolCallParser from './TailwindToolCallParser';
import TailwindTopicManager from './TailwindTopicManager';
import TailwindMessagePersistence, { useMessagePersistence } from './TailwindMessagePersistence';
import { ConsentProvider } from '../../contexts/ConsentContext';
import { ChatHistoryProvider, useChatHistory } from '../../contexts/ChatHistoryContext';
import { AVAILABLE_PERSONAS, Persona } from './TailwindPersonaSelector';
import * as ReactDOM from 'react-dom';
import { decryptApiKey } from '../../utils/encryption';
import { DefaultEventsMap } from '@socket.io/component-emitter';
import db from '../../db/ChatHistoryDB';
import { debugIndexedDB, directDBWrite, ensureDatabaseReady, reinitializeDatabase } from '../../db/ChatHistoryDBUtil';
import { checkDatabaseVersionMismatch, updateStoredDatabaseVersion, getSystemInfo } from '../../utils/version';
import { forceSaveMessage, enhancedDirectDBWrite } from '../../db/DBHelpers';

interface AnthropicError {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

interface ErrorResponse {
  type: string;
  message?: string;
  details?: {
    retryAfter?: number;
  };
  retryAfter?: number;
}

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
  timestamp?: number;
  error?: {
    type: 'rate_limit' | 'credit_balance' | 'other';
    message: string;
    retryAfter?: number;
  };
}

interface AnthropicErrorResponse {
  request_id: string;
  error: {
    type: string;
    error: {
      type: string;
      message: string;
    };
  };
}

interface ServerError {
  type: 'rate_limit' | 'credit_balance' | 'other';
  message: string;
  details?: {
    retryAfter?: number;
  };
}

// Add UserData interface
interface UserData {
  email: string;
  name: string;
  picture: string;
}

// Add type checking helper for message object type
const isUIMessage = (msg: any): msg is Message => {
  return msg && typeof msg.isBot === 'boolean' && typeof msg.text === 'string';
};

const isDBMessage = (msg: any): msg is import('./../../db/ChatHistoryDB').Message => {
  return msg && typeof msg.role === 'string' && typeof msg.content === 'string';
};

// Type for any kind of message object (union type)
type AnyMessage = Message | import('./../../db/ChatHistoryDB').Message | Record<string, any>;

function TailwindApp() {
  const [socket, setSocket] = useState<Socket<DefaultEventsMap, DefaultEventsMap> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [questionsLimit] = useState(6);
  const [selectedPersonaId, setSelectedPersonaId] = useState('yitam');
  const [isPersonaLocked, setIsPersonaLocked] = useState(false);
  const [currentTopicId, setCurrentTopicId] = useState<number | undefined>(undefined);
  const [showTopicManager, setShowTopicManager] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<string | null>(null);
  const currentTopicRef = useRef<number | undefined>(undefined);
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const pendingMessagesRef = useRef<Message[]>([]);
  const messageUpdaterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);
  
  // Access chat history and message persistence contexts
  const { isDBReady, dbError, storageUsage, forceDBInit } = useChatHistory();
  const { saveMessage, saveMessageBatch } = useMessagePersistence();
  
  // Add a message queue ref at the beginning of the component
  // Near other refs like pendingMessagesRef
  const pendingBotMessagesQueue = useRef<{message: Message, topicId: number}[]>([]);
  
  // Update ref when topic ID changes
  useEffect(() => {
    currentTopicRef.current = currentTopicId;
  }, [currentTopicId]);

  // Stable update function that doesn't depend on state
  const updateMessages = useCallback((messages: Message[]) => {
    pendingMessagesRef.current = messages;
    if (!isUpdatingRef.current) {
      isUpdatingRef.current = true;
      if (messageUpdaterTimeoutRef.current) {
        clearTimeout(messageUpdaterTimeoutRef.current);
      }
      messageUpdaterTimeoutRef.current = setTimeout(() => {
        ReactDOM.unstable_batchedUpdates(() => {
          setMessages(pendingMessagesRef.current);
          isUpdatingRef.current = false;
        });
      }, 50);
    }
  }, []);

  // Effect for welcome message - separate from socket effect
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'welcome' && !hasUserSentMessage) {
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
      if (user && messages[0].text !== `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`) {
        updateMessages([{
          id: 'welcome',
          text: `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`,
          isBot: true
        }]);
      }
    }
  }, [selectedPersonaId, user, hasUserSentMessage]);

  // Generate a title for a topic based on conversation content
  const generateTopicTitle = useCallback(async (topicId: number) => {
    if (!socket || !isDBReady) {
      console.error('Cannot generate title: socket or DB not ready');
      return;
    }
    
    try {
      console.log(`Starting title generation for topic ${topicId}`);
      
      // Get the topic to check if it already has a custom title
      const topic = await db.topics.get(topicId);
      if (!topic) {
        console.error(`Cannot generate title: Topic ${topicId} not found in database`);
        return;
      }
      
      if (topic.title !== "New Conversation") {
        console.log(`Topic ${topicId} already has a title: "${topic.title}". Skipping title generation.`);
        return;
      }
      
      // Get messages for this topic
      const messages = await db.messages
        .where('topicId')
        .equals(topicId)
        .toArray();
      
      console.log(`Found ${messages.length} messages for topic ${topicId}`);
      
      // Only generate a title if we have at least 2 messages (1 user, 1 assistant)
      if (messages.length < 2) {
        console.log(`Not enough messages (${messages.length}) to generate a title. Skipping.`);
        return;
      }
      
      // Extract the conversation content
      const conversation = messages
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((msg: AnyMessage) => {
          // Handle message content based on object structure
          // Checking for type to determine how to extract role and content
          let role: string;
          let content: string;

          if (isDBMessage(msg)) {
            role = msg.role;
            content = msg.content;
          } else if (isUIMessage(msg)) {
            role = msg.isBot ? 'assistant' : 'user';
            content = msg.text;
          } else {
            // Fallback with safer access
            const msgObj = msg as Record<string, any>;
            role = msgObj.role === 'user' || msgObj.role === 'assistant' ? msgObj.role : 'user';
            content = typeof msgObj.content === 'string' ? msgObj.content : 
                     typeof msgObj.text === 'string' ? msgObj.text : 
                     'No content available';
          }
          
          return `${role === 'user' ? 'User' : 'Assistant'}: ${content}`;
        })
        .join('\n\n');
      
      console.log(`Sending title generation request to server for topic ${topicId}`);
      console.log(`Conversation sample: ${conversation.substring(0, 100)}...`);
      
      // Return a promise to allow better error handling
      return new Promise((resolve, reject) => {
        // Set a timeout for the title generation request
        const timeoutId = setTimeout(() => {
          console.error(`Title generation request timed out for topic ${topicId}`);
          reject(new Error('Title generation timed out'));
        }, 15000); // 15 second timeout
      
        // Define a title callback handler
        const handleTitleGenerated = (title: string) => {
          clearTimeout(timeoutId); // Clear the timeout
          
          if (!title) {
            console.error('Server returned empty title');
            reject(new Error('Empty title received'));
            return;
          }
          
          console.log(`Received title from server: "${title}"`);
          
          try {
            // Update the topic title in the database
            db.topics.update(topicId, { title })
              .then(() => {
                console.log(`Updated topic title in database to: "${title}"`);
                resolve(title);
              })
              .catch((error) => {
                console.error('Error updating topic title in database:', error);
                reject(error);
              });
          } catch (error) {
            console.error('Error updating topic title in database:', error);
            reject(error);
          }
        };
        
        // Listen for title generation success event
        socket.once('title-generation-success', (data) => {
          if (data.topicId === topicId) {
            handleTitleGenerated(data.title);
          }
        });
      
        // Generate a summary title using the socket
        socket.emit('generate-title', {
          conversation,
          topicId
        });
        
        // Add a separate error handler for socket errors
        socket.once('title-generation-error', (error) => {
          clearTimeout(timeoutId);
          console.error('Title generation error from server:', error);
          reject(new Error(error.message || 'Unknown title generation error'));
        });
      });
    } catch (error) {
      console.error('Error generating topic title:', error);
      throw error; // Re-throw to allow handling by caller
    }
  }, [socket, isDBReady]);

  // Function to explicitly trigger title generation for a topic
  const triggerTitleGeneration = useCallback((topicId: number) => {
    console.log(`[TOPIC DEBUG] Explicitly triggering title generation for topic ${topicId}`);
    
    // Use a small delay to ensure all messages are saved first
    setTimeout(() => {
      generateTopicTitle(topicId)
        .then(title => {
          console.log(`[TOPIC DEBUG] Title generation successful: "${title}"`);
        })
        .catch(error => {
          console.error('[TOPIC DEBUG] Title generation failed:', error);
        });
    }, 2000);
  }, [generateTopicTitle]);

  // Component mount effect - debug IndexedDB
  useEffect(() => {
    const debugDB = async () => {
      console.log("Running IndexedDB diagnostic checks...");
      const isAvailable = await debugIndexedDB();
      console.log("IndexedDB availability:", isAvailable);
      
      if (!isAvailable) {
        console.log("Attempting to reinitialize database...");
        const isReinitialized = await reinitializeDatabase();
        console.log("Database reinitialization result:", isReinitialized);
      }
    };
    
    debugDB();
  }, []);

  // Component mount effect - check database version and reset if needed
  useEffect(() => {
    const checkDbVersion = async () => {
      console.log("Checking database version compatibility...");
      // Check if current DB version matches stored version
      if (checkDatabaseVersionMismatch()) {
        console.log("Database version mismatch detected, resetting database...");
        
        // Show a loading message
        const loadingMessage: Message = {
          id: `system-${Date.now()}`,
          text: 'Phiên bản cơ sở dữ liệu đã thay đổi. Đang cập nhật hệ thống... vui lòng đợi trong giây lát.',
          isBot: true
        };
        
        updateMessages([loadingMessage]);
        
        // Reset the database
        const success = await db.resetDatabase();
        
        if (success) {
          console.log('Database reset complete due to version change');
          // Update stored version
          updateStoredDatabaseVersion();
        } else {
          // If reset failed, show error
          updateMessages([
            {
              id: `error-${Date.now()}`,
              text: 'Không thể cập nhật cơ sở dữ liệu. Vui lòng tải lại trang thủ công.',
              isBot: true,
              error: {
                type: 'other',
                message: 'Database reset failed'
              }
            }
          ]);
        }
      } else {
        console.log("Database version is compatible");
      }
      
      // Log system info for debugging
      const systemInfo = getSystemInfo();
      console.log("System information:", systemInfo);
    };
    
    checkDbVersion();
  }, []);

  // Update the ensureTopicExists function with better validation and retries
  const ensureTopicExists = useCallback(async (): Promise<number | undefined> => {
    // Use existing topic if available
    let topicId = currentTopicRef.current;
    
    if (topicId) {
      console.log(`[TOPIC DEBUG] Using existing topic ID: ${topicId}`);
      
      // Verify the topic actually exists in the database
      try {
        const topic = await db.topics.get(topicId);
        if (topic) {
          console.log(`[TOPIC DEBUG] Verified topic ${topicId} exists`);
          return topicId;
        } else {
          console.warn(`[TOPIC DEBUG] Topic ${topicId} not found in database despite being in current state`);
          // Fall through to create a new topic
        }
      } catch (error) {
        console.error(`[TOPIC DEBUG] Error verifying topic ${topicId}:`, error);
        // Fall through to create a new topic
      }
    }
    
    // Create a new topic if database is ready and user is logged in
    if (isDBReady && user) {
      try {
        console.log('[TOPIC DEBUG] Creating new topic for conversation...');
        const timestamp = Date.now();
        
        // First check if DB is actually ready
        if (!db.isOpen()) {
          console.log('[TOPIC DEBUG] Database not open, attempting to open');
          await db.open();
        }
        
        // Create the new topic with retry logic
        let newTopicId: number | undefined;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (!newTopicId && attempts < maxAttempts) {
          attempts++;
          try {
            console.log(`[TOPIC DEBUG] Topic creation attempt ${attempts} of ${maxAttempts}`);
            
            newTopicId = await db.topics.add({
              userId: user.email,
              title: "New Conversation",
              createdAt: timestamp,
              lastActive: timestamp,
              messageCnt: 0,
              userMessageCnt: 0,
              assistantMessageCnt: 0,
              totalTokens: 0,
              model: 'claude-3',
              systemPrompt: '',
              pinnedState: false
            });
            
            console.log(`[TOPIC DEBUG] Created new topic with ID: ${newTopicId}`);
          } catch (addError) {
            console.error(`[TOPIC DEBUG] Error in topic creation attempt ${attempts}:`, addError);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        if (!newTopicId) {
          console.error('[TOPIC DEBUG] Failed to create topic after multiple attempts');
          return undefined;
        }
        
        // Verify the topic was actually created
        try {
          const createdTopic = await db.topics.get(newTopicId);
          if (!createdTopic) {
            console.error(`[TOPIC DEBUG] Topic ${newTopicId} not found after creation`);
            return undefined;
          }
          console.log(`[TOPIC DEBUG] Verified new topic ${newTopicId} exists in database`);
        } catch (verifyError) {
          console.error(`[TOPIC DEBUG] Error verifying new topic ${newTopicId}:`, verifyError);
          return undefined;
        }
        
        // Update both the state and ref to ensure consistency
        setCurrentTopicId(newTopicId);
        currentTopicRef.current = newTopicId;
        
        return newTopicId;
      } catch (error) {
        console.error('[TOPIC DEBUG] Error creating new topic:', error);
        return undefined;
      }
    }
    
    console.error('[TOPIC DEBUG] Cannot create topic - DB not ready or user not logged in');
    return undefined;
  }, [isDBReady, user]);

  // Socket connection handler
  const connectSocket = useCallback((userData: UserData) => {
    if (!userData) return null;

    console.log('[SOCKET DEBUG] Initializing socket connection');

    // First establish connection with just user data and API key if available
    const apiKey = decryptApiKey();
    const headers: Record<string, string> = {
      'X-User-Email': userData.email,
      'X-User-Name': userData.name
    };
    
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
      console.log('[SOCKET DEBUG] API key included in connection');
    } else {
      console.log('[SOCKET DEBUG] No API key available for connection');
    }

    // Configure socket with options that ensure reliable connections
    const newSocket = io(config.server.url, {
      ...config.server.socketOptions,
      extraHeaders: headers,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true
    });

    const setupSocketListeners = () => {
      // Add this debug listener at the beginning
      newSocket.onAny((event, ...args) => {
        console.log(`[SOCKET DEBUG] Event received: ${event}`, args.length > 0 ? args[0] : '');
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('[SOCKET DEBUG] Connected to server with ID:', newSocket.id);
        
        // Check database readiness when socket connects
        ensureDatabaseReady().then(isReady => {
          console.log(`[SOCKET DEBUG] Database readiness check on socket connect: ${isReady}`);
        });
        
        // Request sample questions after connection
        newSocket.emit('get-sample-questions', questionsLimit);
      });

      newSocket.on('disconnect', (reason) => {
        console.log(`[SOCKET DEBUG] Disconnected from server: ${reason}`);
        setIsConnected(false);
        
        // Handle potential reconnection
        if (reason === 'io server disconnect') {
          // The server has forcefully disconnected - need to reconnect manually
          console.log('[SOCKET DEBUG] Server disconnected - attempting manual reconnect');
          newSocket.connect();
        }
        // Otherwise, the socket will try to reconnect automatically
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log(`[SOCKET DEBUG] Reconnected to server after ${attemptNumber} attempts`);
        setIsConnected(true);
      });

      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`[SOCKET DEBUG] Reconnect attempt ${attemptNumber}`);
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('[SOCKET DEBUG] Reconnect error:', error);
      });

      newSocket.on('reconnect_failed', () => {
        console.error('[SOCKET DEBUG] Failed to reconnect - max attempts reached');
        // Show error to user
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          text: 'Không thể kết nối lại với máy chủ. Vui lòng tải lại trang.',
          isBot: true,
          error: {
            type: 'other',
            message: 'Socket reconnection failed'
          }
        };
        
        // Fix typing issue by directly using the current reference and then updating
        pendingMessagesRef.current = [...pendingMessagesRef.current, errorMessage];
        updateMessages(pendingMessagesRef.current);
      });

      newSocket.on('error', (error) => {
        console.error('[SOCKET DEBUG] Socket error:', error);
      });

      // Clear existing event listeners if socket is being reused
      newSocket.off('bot-response-start');
      newSocket.off('bot-response-chunk');
      newSocket.off('bot-response-error');
      newSocket.off('bot-response-end');

      // Now add the event listeners
      newSocket.on('bot-response-start', (response: { id: string }) => {
        console.log(`[SOCKET DEBUG] Bot response start received for ID: ${response.id}`);
        const botTimestamp = Date.now() + 100;
        const botId = `bot-${botTimestamp}-${response.id}`;
        const currentMessages = pendingMessagesRef.current;
        
        updateMessages([
          ...currentMessages,
          { 
            id: botId, 
            text: '', 
            isBot: true, 
            isStreaming: true,
            timestamp: botTimestamp 
          }
        ]);
      });

      newSocket.on('bot-response-chunk', (response: { text: string, id: string }) => {
        const currentMessages = pendingMessagesRef.current;
        const updatedMessages = currentMessages.map(msg => 
          msg.id.includes(`-${response.id}`)
            ? { ...msg, text: msg.text + response.text }
            : msg
        );
        updateMessages(updatedMessages);
      });

      newSocket.on('bot-response-error', (error: { id: string, error: AnthropicError }) => {
        console.error('Bot response error:', error);
        const currentMessages = pendingMessagesRef.current;
        
        // Find the message that was being streamed
        const updatedMessages = currentMessages.map(msg => {
          if (msg.id.includes(`-${error.id}`)) {
            // Check for credit balance error in the error message
            const isCreditBalanceError = error.error?.error?.message?.toLowerCase().includes('credit balance') ||
                                       error.error?.type?.toLowerCase().includes('credit_balance');
            
            return {
              ...msg,
              isStreaming: false,
              error: {
                type: isCreditBalanceError ? 'credit_balance' as const : 'other' as const,
                message: isCreditBalanceError
                  ? 'Số dư tín dụng API Anthropic của bạn quá thấp. Vui lòng truy cập Kế hoạch & Thanh toán để nâng cấp hoặc mua thêm tín dụng.'
                  : error.error?.error?.message || 'Xin lỗi, đã xảy ra lỗi khi xử lý phản hồi. Vui lòng thử lại.'
              }
            };
          }
          return msg;
        });
        
        updateMessages(updatedMessages);
      });

      newSocket.on('bot-response-end', (response: { id: string, error?: boolean, errorMessage?: string }) => {
        console.log(`[SOCKET DEBUG] Bot response end received for ID: ${response.id}`);
        
        try {
        const currentMessages = pendingMessagesRef.current;
          let botMessage: Message | null = null;
          
          // Find the bot message that was streaming
          for (const msg of currentMessages) {
          if (msg.id.includes(`-${response.id}`)) {
              botMessage = msg;
              break;
            }
          }
          
          if (!botMessage) {
            console.error(`[SOCKET DEBUG] Could not find bot message with ID containing: ${response.id}`);
            return;
          }
          
          console.log(`[SOCKET DEBUG] Found bot message: ${botMessage.id}, length: ${botMessage.text.length}`);
          
          // Stop streaming
          botMessage.isStreaming = false;
          
          // Update the UI
          const updatedMessages = currentMessages.map(msg => 
            msg.id === botMessage?.id ? { ...botMessage } : msg
          );
          updateMessages(updatedMessages);
          
          // Handle error case
            if (response.error && response.errorMessage) {
            console.error(`[SOCKET DEBUG] Bot response error: ${response.errorMessage}`);
            botMessage.error = {
              type: 'other',
              message: response.errorMessage
            };
            return;
          }
          
          // Log current state
          console.log(`[SOCKET DEBUG] DB ready: ${isDBReady}, message length: ${botMessage.text.length}`);
          
          // Check if message is valid and should be saved
          if (botMessage.text.length > 0) {
            // SIMPLER DIRECT APPROACH - Try an immediate direct save
            (async () => {
              try {
                console.log(`[DIRECT SAVE] Starting direct save for bot message of length ${botMessage.text.length}`);
                
                // Get or create topic
                let topicId = currentTopicRef.current;
                if (!topicId) {
                  // Create a new topic directly
                  console.log(`[DIRECT SAVE] No topic ID found, creating a new one`);
                  if (!user) {
                    console.error(`[DIRECT SAVE] Cannot create topic - no user data`);
                    return;
                  }
                  
                  try {
                    const timestamp = Date.now();
                    topicId = await db.topics.add({
                      userId: user.email,
                      title: "New Conversation",
                      createdAt: timestamp,
                      lastActive: timestamp,
                      messageCnt: 0,
                      userMessageCnt: 0,
                      assistantMessageCnt: 0,
                      totalTokens: 0,
                      model: 'claude-3',
                      systemPrompt: '',
                      pinnedState: false
                    });
                    
                    console.log(`[DIRECT SAVE] Created new topic with ID: ${topicId}`);
                    setCurrentTopicId(topicId);
                    currentTopicRef.current = topicId;
                  } catch (err) {
                    console.error(`[DIRECT SAVE] Failed to create topic:`, err);
                    return;
                  }
                }
                
                if (!topicId) {
                  console.error(`[DIRECT SAVE] Failed to obtain valid topic ID`);
                  return;
                }
                
                // Use a try-catch for each step to isolate failures
                try {
                  // 1. First verify topic exists
                  const topic = await db.topics.get(topicId);
                  if (!topic) {
                    console.error(`[DIRECT SAVE] Topic ${topicId} not found in database`);
                    return;
                  }
                  console.log(`[DIRECT SAVE] Verified topic ${topicId} exists: ${topic.title}`);
                  
                  // 2. Direct database insert - skipping all abstraction layers
                  const messageId = await db.messages.add({
                    topicId,
                    timestamp: Date.now(),
                    role: 'assistant',
                    content: botMessage.text,
                    type: 'text',
                    tokens: Math.ceil(botMessage.text.length / 4),
                    modelVersion: 'claude-3'
                  });
                  
                  console.log(`[DIRECT SAVE] Successfully added bot message with ID: ${messageId}`);
                  
                  // 3. Update topic statistics
                  try {
                    await db.topics.update(topicId, {
                      lastActive: Date.now(),
                      messageCnt: (topic.messageCnt || 0) + 1,
                      assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1,
                      totalTokens: (topic.totalTokens || 0) + Math.ceil(botMessage.text.length / 4)
                    });
                    console.log(`[DIRECT SAVE] Updated topic statistics`);
                  } catch (statsErr) {
                    console.error(`[DIRECT SAVE] Failed to update topic statistics:`, statsErr);
                    // Non-critical error, continue
                  }
                  
                  // 4. Verify message was saved
                  const savedMessage = await db.messages.get(messageId);
                  if (!savedMessage) {
                    console.error(`[DIRECT SAVE] Failed to verify message save - ID ${messageId} not found`);
                  } else {
                    console.log(`[DIRECT SAVE] Verified message with ID ${messageId} was saved: ${savedMessage.content.substring(0, 30)}...`);
                  }
                } catch (dbErr) {
                  console.error(`[DIRECT SAVE] Database operation failed:`, dbErr);
                  // Try one more approach - the forceSave method
                  if (user) {
                    console.log(`[DIRECT SAVE] Attempting force save as last resort`);
                    try {
                      const success = await forceSaveMessage(
                        user.email,
                        'assistant',
                        botMessage.text
                      );
                      if (success) {
                        console.log(`[DIRECT SAVE] Force save succeeded`);
                      } else {
                        console.error(`[DIRECT SAVE] Force save failed`);
                      }
                    } catch (forceSaveErr) {
                      console.error(`[DIRECT SAVE] Force save error:`, forceSaveErr);
                    }
                  }
                }
              } catch (outerErr) {
                console.error(`[DIRECT SAVE] Outer error in direct save:`, outerErr);
              }
            })();
            
            // Original logic continues below...
            (async () => {
              try {
                // Get current topic or verify it exists
                let topicId = currentTopicRef.current;
                
                if (!topicId) {
                  console.log(`[TOPIC DEBUG] No topic ID for bot message, attempting to create one`);
                  topicId = await ensureTopicExists();
                } else {
                  // Verify topic exists
                  const topic = await db.topics.get(topicId);
                  if (!topic) {
                    console.log(`[TOPIC DEBUG] Topic ${topicId} not found, creating new one for bot message`);
                    topicId = await ensureTopicExists();
                  }
                }
                
                if (!topicId) {
                  console.error(`[TOPIC DEBUG] Failed to get or create valid topic for bot message`);
                  return;
                }
                
                console.log(`[TOPIC DEBUG] Using topic ${topicId} for bot message`);
                
                // From here on, topicId is guaranteed to be a number and not undefined
                const finalTopicId: number = topicId; // Create a non-nullable version
                
                // If DB is ready, save immediately, otherwise queue for later
                if (isDBReady) {
                  console.log(`[TOPIC DEBUG] Preparing to save assistant message to topic ${finalTopicId}, length: ${botMessage.text.length}`);
                  
                  // Use a self-executing async function to handle the database operations
                  let saveAttemptCount = 0;
                  const MAX_SAVE_ATTEMPTS = 3;
                  let savedSuccessfully = false;
                  
                  while (saveAttemptCount < MAX_SAVE_ATTEMPTS && !savedSuccessfully) {
                    saveAttemptCount++;
                    console.log(`[TOPIC DEBUG] Bot message save attempt ${saveAttemptCount} of ${MAX_SAVE_ATTEMPTS}`);
                    
                    try {
                      // Double-check topic exists before saving
                      const topicExists = await db.topics.get(finalTopicId);
                      if (!topicExists) {
                        console.error(`[TOPIC DEBUG] Topic ${finalTopicId} not found before bot message save attempt ${saveAttemptCount}`);
                        
                        if (saveAttemptCount < MAX_SAVE_ATTEMPTS) {
                          // Try to recreate the topic
                          console.log(`[TOPIC DEBUG] Attempting to recreate missing topic for bot message`);
                          const newTopicId = await ensureTopicExists();
                          if (!newTopicId) {
                            console.error(`[TOPIC DEBUG] Failed to recreate topic for bot message`);
                            continue;
                          }
                          // Update our non-nullable topic ID with the new valid ID
                          topicId = newTopicId;
                        } else {
                          throw new Error(`Topic ${finalTopicId} not found`);
                        }
                      }
                      
                      // Prepare message data with unique ID
                      const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
                      console.log(`[TOPIC DEBUG] Generated unique ID for assistant message: ${uniqueId}`);
                      
                      const messageData = {
                        id: uniqueId,
                        topicId: finalTopicId,
                        timestamp: botMessage.timestamp || Date.now(),
                        role: 'assistant' as const,
                        content: botMessage.text,
                        type: 'text',
                        tokens: Math.ceil(botMessage.text.length / 4),
                        modelVersion: 'claude-3'
                      };
                      
                      // Choose method based on attempt number
                      let messageId = -1;
                      
                      if (saveAttemptCount === 1) {
                        // First try context saveMessage
                        console.log(`[TOPIC DEBUG] Method 1: Using context saveMessage for bot response, topic: ${finalTopicId}`);
                        messageId = await saveMessage(finalTopicId, {
                          timestamp: messageData.timestamp,
                          role: 'assistant',
                          content: botMessage.text,
                          type: 'text',
                          tokens: messageData.tokens,
                          modelVersion: 'claude-3'
                        });
                      } else if (saveAttemptCount === 2) {
                        // Then try safePutMessage
                        console.log(`[TOPIC DEBUG] Method 2: Using db.safePutMessage for bot response, topic: ${finalTopicId}`);
                        messageId = await db.safePutMessage(messageData);
                      } else {
                        // Last try direct write
                        console.log(`[TOPIC DEBUG] Method 3: Using direct write for bot response, topic: ${finalTopicId}`);
                        const success = await enhancedDirectDBWrite(
                          finalTopicId,
                          {
                            role: 'assistant',
                            content: botMessage.text,
                            timestamp: messageData.timestamp
                          }
                        );
                        
                        if (success) {
                          console.log(`[TOPIC DEBUG] Direct write succeeded for bot response`);
                          savedSuccessfully = true;
                          
                          // Update topic statistics manually
                          try {
                            const topic = await db.topics.get(finalTopicId);
                            if (topic) {
                              await db.topics.update(finalTopicId, {
                                lastActive: messageData.timestamp,
                                messageCnt: (topic.messageCnt || 0) + 1,
                                assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1,
                                totalTokens: (topic.totalTokens || 0) + messageData.tokens
                              });
                              console.log(`[TOPIC DEBUG] Updated statistics for topic ${finalTopicId} after bot message save`);
                            }
                          } catch (statsError) {
                            console.error('[TOPIC DEBUG] Failed to update topic stats:', statsError);
                          }
                        } else {
                          console.error('[TOPIC DEBUG] Direct write failed for bot response');
                        }
                      }
                      
                      if (messageId > 0) {
                        console.log(`[TOPIC DEBUG] Bot response saved successfully with ID: ${messageId}`);
                        savedSuccessfully = true;
                        
                        // Try to trigger title generation
                        try {
                          console.log(`[TOPIC DEBUG] Triggering title generation for topic ${finalTopicId}`);
                          triggerTitleGeneration(finalTopicId);
                        } catch (titleError) {
                          console.error('[TOPIC DEBUG] Error triggering title generation:', titleError);
                        }
                      } else if (messageId <= 0 && saveAttemptCount < MAX_SAVE_ATTEMPTS) {
                        console.error(`[TOPIC DEBUG] Invalid message ID: ${messageId}, trying next method`);
                      }
                    } catch (saveError) {
                      console.error(`[TOPIC DEBUG] Error in bot response save attempt ${saveAttemptCount}:`, saveError);
                      
                      // On final attempt, add to queue if all direct saves fail
                      if (saveAttemptCount >= MAX_SAVE_ATTEMPTS) {
                        console.log(`[TOPIC DEBUG] All save attempts failed for bot message, adding to queue`);
                        pendingBotMessagesQueue.current.push({
                          message: botMessage,
                          topicId: finalTopicId
                        });
                      }
                    }
                  }
                } else {
                  // Queue the message for when DB becomes ready
                  console.log(`[TOPIC DEBUG] Database not ready. Queueing bot message for later processing.`);
                  pendingBotMessagesQueue.current.push({
                    message: botMessage,
                    topicId: finalTopicId
                  });
                  console.log(`[TOPIC DEBUG] Bot message queued. Queue size: ${pendingBotMessagesQueue.current.length}`);
                }
              } catch (error) {
                console.error('[TOPIC DEBUG] Unexpected error handling bot message:', error);
              }
            })();
          } else {
            console.log(`[TOPIC DEBUG] Skipping message save - Empty message`);
          }
        } catch (error) {
          console.error('[SOCKET DEBUG] Error processing bot-response-end:', error);
        }
      });

      newSocket.on('error', (error: ServerError | string) => {
        console.error('Server error:', error);
        let errorObj: Message['error'];
        
        // Try to parse error if it's a JSON string
        if (typeof error === 'string') {
          try {
            const parsedError = JSON.parse(error);
            errorObj = {
              type: parsedError.type as 'rate_limit' | 'credit_balance' | 'other',
              message: parsedError.message
            };
          } catch (e) {
            // If parsing fails, treat as a regular string error
            errorObj = {
              type: 'other' as const,
              message: error
            };
          }
        } else {
          // Handle ServerError object
          errorObj = {
            type: error.type,
            message: error.message
          };
        }

        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          text: '',
          isBot: true,
          error: errorObj
        };
        
        const currentMessages = pendingMessagesRef.current;
        updateMessages([...currentMessages, errorMessage]);
      });

      // ... other socket event listeners ...
    };

    // Set up the listeners
    setupSocketListeners();
    
    // Debug log socket state
    setTimeout(() => {
      console.log('[SOCKET DEBUG] Socket state after setup:', { 
        connected: newSocket.connected,
        id: newSocket.id,
        disconnected: newSocket.disconnected
      });
    }, 1000);

    return newSocket;
  }, [updateMessages, questionsLimit]);

  // Auth success handler
  const handleAuthSuccess = useCallback((userData: UserData) => {
    // Store user data first
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  // Socket connection effect - separate from auth
  useEffect(() => {
    let currentSocket: Socket<DefaultEventsMap, DefaultEventsMap> | null = null;

    if (user) {
      currentSocket = connectSocket(user);
      if (currentSocket) {
        setSocket(currentSocket);
      }
    }

    return () => {
      if (currentSocket) {
        currentSocket.disconnect();
      }
      if (messageUpdaterTimeoutRef.current) {
        clearTimeout(messageUpdaterTimeoutRef.current);
      }
    };
  }, [user, connectSocket]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (socket) {
      socket.disconnect();
    }
    if (messageUpdaterTimeoutRef.current) {
      clearTimeout(messageUpdaterTimeoutRef.current);
    }
    pendingMessagesRef.current = [];
    isUpdatingRef.current = false;
    ReactDOM.unstable_batchedUpdates(() => {
      setSocket(null);
      setIsConnected(false);
      setMessages([]);
      setHasUserSentMessage(false);
      setIsPersonaLocked(false);
      setSelectedPersonaId('yitam');
    });
  }, [socket]);

  // Logout handler
  const handleLogout = useCallback(() => {
    cleanup();
    localStorage.removeItem('user');
    setUser(null);
  }, [cleanup]);

  // Modify the sendMessage function to use a more robust approach for ensuring topic exists
  const sendMessage = useCallback((text: string) => {
    if (text.trim() === '') return;
    
    if (!socket) {
      console.error('[SOCKET DEBUG] Cannot send message - socket is not available');
      
      // Show error message to user
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: 'Không thể kết nối đến máy chủ. Vui lòng tải lại trang.',
        isBot: true,
        error: {
          type: 'other',
          message: 'Socket connection unavailable'
        }
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      return;
    }
    
    if (!socket.connected) {
      console.error('[SOCKET DEBUG] Socket is not connected. Attempting to reconnect...');
      socket.connect();
      
      // Show connecting message to user
      const connectingMessage: Message = {
        id: `system-${Date.now()}`,
        text: 'Đang kết nối lại với máy chủ...',
        isBot: true
      };
      
      setMessages(prevMessages => [...prevMessages, connectingMessage]);
      
      // Wait for connection and then send
      socket.once('connect', () => {
        console.log('[SOCKET DEBUG] Reconnected successfully, now sending message');
        sendMessage(text);
      });
      
      return;
    }
    
    if (lastMessageRef.current === text) {
      console.log('[SOCKET DEBUG] Duplicate message prevented:', text);
      return;
    }
    
    console.log('[SOCKET DEBUG] Sending message:', text);
    
    lastMessageRef.current = text;
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const userMessage: Message = {
      id: `user-${timestamp}-${randomId}`,
      text,
      isBot: false,
      timestamp
    };
    
    // Update UI state
    setHasUserSentMessage(true);
    setIsPersonaLocked(true);
    setMessages(prevMessages => [...prevMessages, userMessage]);
    pendingMessagesRef.current = [...pendingMessagesRef.current, userMessage];
    
    // First ensure we have a topic, then send the message and save it
    ensureTopicExists().then(topicId => {
      if (!topicId) {
        console.error('[TOPIC DEBUG] Failed to get or create a topic for message');
        // Show error to user
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          text: 'Không thể lưu trữ tin nhắn. Vui lòng tải lại trang.',
          isBot: true,
          error: {
            type: 'other',
            message: 'Topic creation failed'
          }
        };
        
        setMessages(prevMessages => [...prevMessages, errorMessage]);
        return;
      }
      
      console.log(`[TOPIC DEBUG] Using topic ${topicId} for message`);
      
      // Create a new topic if none exists or store message in current topic
      const handleMessageStorage = async () => {
        try {
          console.log(`[TOPIC DEBUG] Saving user message to DB for topic: ${topicId}, content: "${text.substring(0, 30)}..."`);
          
          // Try each storage method in sequence
          const storeMessage = async () => {
            let saveAttemptCount = 0;
            const MAX_SAVE_ATTEMPTS = 3;
            let savedSuccessfully = false;

            while (saveAttemptCount < MAX_SAVE_ATTEMPTS && !savedSuccessfully) {
              saveAttemptCount++;
              console.log(`[TOPIC DEBUG] Save attempt ${saveAttemptCount} of ${MAX_SAVE_ATTEMPTS}`);
              
              try {
                let messageId = -1;
                
                // Double-check topic exists before each save attempt
                const topicExists = await db.topics.get(topicId);
                if (!topicExists) {
                  console.error(`[TOPIC DEBUG] Topic ${topicId} no longer exists before save attempt ${saveAttemptCount}`);
                  throw new Error(`Topic ${topicId} not found before save`);
                }
                
                // Prepare message data with pre-assigned ID to avoid auto-increment issues
                const messageData = {
                  id: Date.now() + Math.floor(Math.random() * 1000),
                  topicId: topicId,
                  timestamp,
                  role: 'user' as const,
                  content: text,
                  type: 'text',
                  tokens: Math.ceil(text.length / 4)
                };

                // Choose method based on attempt number
                if (saveAttemptCount === 1) {
                  // Method 1: Try the context saveMessage
                  console.log('[TOPIC DEBUG] Method 1: Using context saveMessage');
                  messageId = await saveMessage(topicId, {
                    timestamp,
                    role: 'user',
                    content: text,
                    type: 'text',
                    tokens: Math.ceil(text.length / 4)
                  });
                } else if (saveAttemptCount === 2) {
                  // Method 2: Try safePutMessage
                  console.log('[TOPIC DEBUG] Method 2: Using db.safePutMessage');
                  messageId = await db.safePutMessage(messageData);
                } else {
                  // Method 3: Try direct IndexedDB write
                  console.log('[TOPIC DEBUG] Method 3: Using directDBWrite');
                  const success = await directDBWrite(
                    topicId,
                    {
                      role: 'user',
                      content: text,
                      timestamp
                    }
                  );
                  
                  if (success) {
                    console.log('[TOPIC DEBUG] Direct IndexedDB write succeeded');
                    savedSuccessfully = true;
                    
                    // Update topic statistics manually since directDBWrite doesn't do this
                    try {
                      const topic = await db.topics.get(topicId);
                      if (topic) {
                        await db.topics.update(topicId, {
                          lastActive: timestamp,
                          messageCnt: (topic.messageCnt || 0) + 1,
                          userMessageCnt: (topic.userMessageCnt || 0) + 1,
                          totalTokens: (topic.totalTokens || 0) + messageData.tokens
                        });
                        console.log(`[TOPIC DEBUG] Updated statistics for topic ${topicId}`);
                      }
                    } catch (statsError) {
                      console.error('[TOPIC DEBUG] Failed to update topic stats:', statsError);
                    }
                    
                    return true;
                  } else {
                    console.error('[TOPIC DEBUG] Direct IndexedDB write failed');
                    // If all attempts failed, suggest database reset
                    if (saveAttemptCount >= MAX_SAVE_ATTEMPTS) {
                      console.error('[TOPIC DEBUG] All save attempts failed, suggesting database reset');
                      setTimeout(() => {
                        resetDatabase();
                      }, 1000);
                    }
                    continue;
                  }
                }
                
                if (messageId > 0) {
                  console.log(`[TOPIC DEBUG] Message saved successfully with ID: ${messageId}`);
                  savedSuccessfully = true;
                  return true;
                } else {
                  console.error(`[TOPIC DEBUG] Failed with method ${saveAttemptCount}, returned ID: ${messageId}`);
                }
              } catch (error) {
                console.error(`[TOPIC DEBUG] Error in save attempt ${saveAttemptCount}:`, error);
              }
            }
            
            // If all attempts failed and not handled above
            if (!savedSuccessfully && saveAttemptCount >= MAX_SAVE_ATTEMPTS) {
              console.error('[TOPIC DEBUG] All save methods failed after maximum attempts');
              // Suggest database reset as a last resort
              setTimeout(() => {
                resetDatabase();
              }, 1000);
              return false;
            }
            
            return savedSuccessfully;
          };
          
          const result = await storeMessage();
          if (!result) {
            console.error('[TOPIC DEBUG] Failed to save message after all attempts');
          }
        } catch (error) {
          console.error('[TOPIC DEBUG] Error saving message to database:', error);
        }
      };
      
      // Execute message persistence
      handleMessageStorage();
      
      // Send the message to the server (do this after UI update for responsiveness)
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
      socket.emit('chat-message', {
        message: text,
        personaId: selectedPersonaId,
        domains: selectedPersona.domains
      });
      
      console.log('[TOPIC DEBUG] Message sent, current messages:', pendingMessagesRef.current.length);
    }).catch(error => {
      console.error('[TOPIC DEBUG] Error ensuring topic exists:', error);
      // Add error message to chat
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: 'Không thể lưu trữ tin nhắn. Vui lòng tải lại trang.',
        isBot: true,
        error: {
          type: 'other',
          message: 'Topic creation failed'
        }
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    });
  }, [socket, selectedPersonaId, setMessages, isDBReady, user, saveMessage, ensureTopicExists]);

  // Function to start a new chat
  const startNewChat = useCallback(() => {
    console.log('Starting new chat...');
    
    // Create a new topic if database is ready AND this was explicitly requested (not just initial load)
    if (isDBReady && user) {
      // Implement topic creation logic directly instead of calling createNewTopic
      (async () => {
        try {
          // Create a new topic
          const topicId = await db.topics.add({
            userId: user.email,
            title: "New Conversation",
            createdAt: Date.now(),
            lastActive: Date.now(),
            messageCnt: 0,
            userMessageCnt: 0,
            assistantMessageCnt: 0,
            totalTokens: 0,
            model: 'claude-3',
            systemPrompt: '',
            pinnedState: false
          });
          
          // Set as current topic
          setCurrentTopicId(topicId);
          currentTopicRef.current = topicId;
          
          // Create welcome message
          const timestamp = Date.now();
          const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
          const welcomeMessage: Message = {
            id: 'welcome',
            text: user 
              ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`
              : `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
            isBot: true,
            timestamp
          };
          
          // Reset all states
          lastMessageRef.current = null;
          pendingMessagesRef.current = [welcomeMessage];
          
          // Update UI state
          setMessages([welcomeMessage]);
        } catch (error) {
          console.error('Error creating new topic:', error);
        }
      })();
    } else {
      // Find selected persona
      const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
      
      // Create welcome message WITHOUT creating a new topic
      const timestamp = Date.now();
      const welcomeMessage: Message = {
        id: 'welcome',
        text: user 
          ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`
          : `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
          isBot: true,
          timestamp
      };

      // Reset all states
      lastMessageRef.current = null;
      pendingMessagesRef.current = [welcomeMessage];
      
      // Update UI state
      setMessages([welcomeMessage]);
      
      // Clear current topic reference on new chat without DB (important)
      setCurrentTopicId(undefined);
      currentTopicRef.current = undefined;
    }
    
    // Always reset these states
    setHasUserSentMessage(false);
    setIsPersonaLocked(false);
    
    console.log('New chat started, states reset');
  }, [selectedPersonaId, user, isDBReady]);

  // Initialize messages when component mounts or user changes - SHOW WELCOME WITHOUT CREATING TOPIC
  useEffect(() => {
    if (messages.length === 0 && user) {
      console.log('Initializing welcome message without creating topic...');
      
      // Create welcome message only (no topic creation)
      const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
      const welcomeMessage: Message = {
        id: 'welcome',
        text: `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true,
        timestamp: Date.now()
      };
      
      // Update messages without creating a topic
      lastMessageRef.current = null;
      pendingMessagesRef.current = [welcomeMessage];
      setMessages([welcomeMessage]);
      
      // Reset states
      setHasUserSentMessage(false);
      setIsPersonaLocked(false);
    }
  }, [messages.length, user, selectedPersonaId]);

  // Memoize sorted messages
  const sortedMessages = useMemo(() => {
    console.log('Sorting messages, count:', messages.length);
    return [...messages].sort((a, b) => {
      // Welcome message always first
      if (a.id === 'welcome') return -1;
      if (b.id === 'welcome') return 1;
      
      // Use timestamp for sorting if available
      if (a.timestamp && b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      
      // Extract timestamps from IDs as fallback
      const getTimestamp = (id: string) => {
        // Try to extract timestamp from msg-id-timestamp format
        const match = id.match(/-(\d+)(?:-|$)/);
        if (match) return parseInt(match[1], 10);
        
        // Legacy format with timestamp in ID
        const legacyMatch = id.match(/-(\d+)-/);
        return legacyMatch ? parseInt(legacyMatch[1], 10) : 0;
      };
      
      return getTimestamp(a.id) - getTimestamp(b.id);
    });
  }, [messages]);

  // Debug logging for state changes
  useEffect(() => {
    console.log('State update - Messages:', messages.length, 'HasUserSent:', hasUserSentMessage);
  }, [messages, hasUserSentMessage]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    const chatContainer = document.getElementById('yitam-chat-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);

  // Add user profile component in header
  const [showApiSettings, setShowApiSettings] = useState(false);
  
  const UserProfile = () => (
    user && (
      <div className="relative group">
        <button className="flex items-center space-x-2 p-2 rounded-lg hover:bg-[#78A16115] transition-all">
          <img
            src={user.picture}
            alt={user.name}
            className="w-9 h-9 rounded-full border-2 border-[#78A161] group-hover:border-[#5D4A38] transition-colors"
          />
          <div className="hidden md:block text-left">
            <p className="text-sm font-medium text-[#5D4A38] line-clamp-1">{user.name}</p>
            <p className="text-xs text-[#5D4A38] opacity-70">Đã xác thực</p>
          </div>
          <svg className="w-4 h-4 text-[#78A161] group-hover:text-[#5D4A38] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu */}
        <div className="absolute right-0 top-full mt-1 w-64 py-1 bg-white rounded-lg shadow-lg border border-[#E6DFD1] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
          <button
            onClick={() => setShowTopicManager(true)}
            className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
          >
            <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Quản lý cuộc trò chuyện
          </button>
          <button
            onClick={() => setShowApiSettings(true)}
            className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
          >
            <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Cài đặt API Key
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-2 text-sm text-[#BC4749] hover:bg-[#BC474915] transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Đăng xuất
          </button>
        </div>
      </div>
    )
  );

  // Modify sendMessage to use debounced updates
  const onSelectPersona = (personaId: string) => {
    if (isPersonaLocked) return; // Don't allow changes if locked
    
    // Update the selected persona
    setSelectedPersonaId(personaId);
    
    // Find the newly selected persona
    const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === personaId) || AVAILABLE_PERSONAS[0];
    
    // Update the welcome message with the new persona
    updateMessages([
      {
        id: 'welcome',
        text: `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true
      }
    ]);
    
    console.log(`Selected persona: ${personaId}`, selectedPersona);
  };

  // Check if any bot message is currently streaming
  const isBotResponding = messages.some(msg => msg.isBot && msg.isStreaming);

  // Check if API key is stored
  const hasStoredApiKey = () => {
    const apiKey = decryptApiKey();
    return !!apiKey;
  };

  // Create a new topic
  const createNewTopic = useCallback(async (title: string) => {
    if (!user || !isDBReady) return;
    
    try {
      // Create a new topic
      const topicId = await db.topics.add({
        userId: user.email,
        title,
        createdAt: Date.now(),
        lastActive: Date.now(),
        messageCnt: 0,
        userMessageCnt: 0,
        assistantMessageCnt: 0,
        totalTokens: 0,
        model: 'claude-3',
        systemPrompt: '',
        pinnedState: false
      });
      
      // Set as current topic
      setCurrentTopicId(topicId);
      
      // Reset message state with welcome message
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
      const welcomeMessage = {
        id: 'welcome',
        text: user ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!` : 
                    `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true
      };
      
      updateMessages([welcomeMessage]);
      
      return topicId;
    } catch (error) {
      console.error('Error creating new topic:', error);
      return undefined;
    }
  }, [user, isDBReady, selectedPersonaId, updateMessages]);

  // Load messages for a topic
  const loadTopicMessages = useCallback(async (topicId: number) => {
    try {
      console.log(`Loading messages for topic ${topicId}...`);
      
      // First, get the topic details for personalization
      const topic = await db.topics.get(topicId);
      if (!topic) {
        console.error(`Topic ${topicId} not found`);
        return;
      }
      
      console.log(`Found topic: ${topic.title}`);
      
      // Load all messages for this topic, ordered by timestamp
      const topicMessages = await db.messages
        .where('topicId')
        .equals(topicId)
        .sortBy('timestamp');
      
      console.log(`Loaded ${topicMessages.length} messages for topic ${topicId}`);
      
      // Convert from DB format to UI format with proper IDs
      const uiMessages = topicMessages.map(dbMsg => ({
        id: `msg-${dbMsg.id || 'unknown'}-${dbMsg.timestamp}`,
        text: dbMsg.content,
        isBot: dbMsg.role === 'assistant',
        timestamp: dbMsg.timestamp
      }));
      
      // If there are no messages, add a welcome message
      if (uiMessages.length === 0) {
        const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
        uiMessages.push({
          id: 'welcome',
          text: user ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!` : 
                      `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
          isBot: true,
          timestamp: Date.now()
        });
        console.log('No messages found, added welcome message');
      } else {
        console.log(`Converted ${uiMessages.length} messages to UI format`);
      }
      
      // Sort messages by timestamp to ensure proper order
      uiMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      
      // Update the UI with the messages
      updateMessages(uiMessages);
      console.log('Messages updated in UI');
      
      // Scroll to the bottom after messages are loaded
      setTimeout(() => {
        const chatContainer = document.getElementById('yitam-chat-container');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 100);
    } catch (error) {
      console.error('Error loading topic messages:', error);
    }
  }, [selectedPersonaId, user, updateMessages]);

  // Handle selecting a topic
  const handleTopicSelect = useCallback(async (topicId: number) => {
    try {
      console.log(`Selecting topic ${topicId}...`);
      
      // Update state and ref
      setCurrentTopicId(topicId);
      currentTopicRef.current = topicId;
      
      // Mark topic as active
      await db.topics.update(topicId, { lastActive: Date.now() });
      console.log(`Updated lastActive for topic ${topicId}`);
      
      // Get the topic
      const topic = await db.topics.get(topicId);
      
      // If topic still has default title, try to generate one
      if (topic && topic.title === "New Conversation") {
        console.log(`Topic ${topicId} has default title, attempting to generate a better one`);
        triggerTitleGeneration(topicId);
      }
      
      // Load messages for this topic
      await loadTopicMessages(topicId);
      
      // Reset message state
      setHasUserSentMessage(true); // Avoid showing sample questions
      setIsPersonaLocked(true); // Lock persona selection
      
      console.log(`Topic ${topicId} loaded with messages`);
    } catch (error) {
      console.error('Error selecting topic:', error);
    }
  }, [loadTopicMessages, triggerTitleGeneration]);

  // Reset database function
  const resetDatabase = async () => {
    console.log('Attempting to reset database due to persistent errors');
    
    try {
      const confirmed = window.confirm(
        'There appear to be persistent database errors. Would you like to reset the database? ' +
        'This will clear all your chat history but may fix the issue.'
      );
      
      if (confirmed) {
        // Clear any cached topics or messages
        currentTopicRef.current = undefined;
        setCurrentTopicId(undefined);
        
        // Show a loading message
        const loadingMessage: Message = {
          id: `system-${Date.now()}`,
          text: 'Đang khởi tạo lại cơ sở dữ liệu... vui lòng đợi trong giây lát.',
          isBot: true
        };
        
        updateMessages([loadingMessage]);
        
        // Reset the database
        const success = await db.resetDatabase();
        
        if (success) {
          console.log('Database reset complete, reloading...');
          // The database reset will trigger a page reload
        } else {
          // If reset failed, show error
          updateMessages([
            {
              id: `error-${Date.now()}`,
              text: 'Không thể khởi tạo lại cơ sở dữ liệu. Vui lòng tải lại trang thủ công.',
              isBot: true,
              error: {
                type: 'other',
                message: 'Database reset failed'
              }
            }
          ]);
        }
      } else {
        console.log('Database reset cancelled by user');
      }
    } catch (error) {
      console.error('Error during database reset:', error);
    }
  };

  // Add a DB ready effect to process queued messages
  useEffect(() => {
    // Process any pending bot messages when DB becomes ready
    if (isDBReady && pendingBotMessagesQueue.current.length > 0) {
      console.log(`[DB DEBUG] Database now ready. Processing ${pendingBotMessagesQueue.current.length} queued bot messages`);
      
      // Process each queued message
      const processQueue = async () => {
        for (const item of pendingBotMessagesQueue.current) {
          try {
            console.log(`[DB DEBUG] Processing queued bot message for topic ${item.topicId}`);
            
            // Create message data
            const messageData = {
              id: Date.now() + Math.floor(Math.random() * 1000),
              topicId: item.topicId,
              timestamp: item.message.timestamp || Date.now(),
              role: 'assistant' as const,
              content: item.message.text,
              type: 'text',
              tokens: Math.ceil(item.message.text.length / 4),
              modelVersion: 'claude-3'
            };
            
            // Try to save the message
            await db.safePutMessage(messageData);
            console.log(`[DB DEBUG] Successfully saved queued bot message for topic ${item.topicId}`);
          } catch (error) {
            console.error(`[DB DEBUG] Failed to save queued bot message:`, error);
          }
        }
        
        // Clear the queue after processing
        pendingBotMessagesQueue.current = [];
      };
      
      processQueue();
    }
  }, [isDBReady]);

  // Add a function to ensure the database is ready early in the app lifecycle
  const ensureDatabaseReady = useCallback(async () => {
    console.log('[DB DEBUG] Ensuring database is ready...');
    
    if (isDBReady) {
      console.log('[DB DEBUG] Database is already ready');
      return true;
    }
    
    try {
      // Use the context's forceDBInit function
      console.log('[DB DEBUG] Forcing database initialization from context');
      const result = await forceDBInit();
      console.log(`[DB DEBUG] Force database initialization result: ${result}`);
      
      return result;
    } catch (error) {
      console.error('[DB DEBUG] Failed to initialize database:', error);
      return false;
    }
  }, [isDBReady, forceDBInit]);

  // Call this function when the component mounts
  useEffect(() => {
    // Initialize the database as early as possible
    ensureDatabaseReady().then(isReady => {
      console.log(`[DB DEBUG] Database initialization result: ${isReady}`);
      
      // If still not ready after our attempt, show a warning
      if (!isReady && !isDBReady) {
        console.warn('[DB DEBUG] Database still not ready after initialization attempt');
      }
    });
  }, [ensureDatabaseReady]);

  if (!user) {
    return (
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <TailwindAuth onAuthSuccess={handleAuthSuccess} />
      </GoogleOAuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <ConsentProvider>
        <ChatHistoryProvider>
          <TailwindMessagePersistence>
        <div className="h-screen bg-[#FDFBF6] text-[#3A2E22] flex justify-center overflow-hidden">
          <div className="w-full max-w-[1000px] flex flex-col h-screen p-2 overflow-hidden">
            <header className="bg-[#F5EFE0] rounded-lg shadow-sm border border-[#E6DFD1]">
              {/* Top section with logo and title */}
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 p-3">
                <div className="flex-none w-[140px] md:w-[200px]">
                  <img 
                    src="/img/yitam-logo.png" 
                    alt="Yitam Logo" 
                    className="h-auto w-full object-contain"
                  />
                </div>
                
                <div className="flex-1 text-center md:text-left">
                  <h1 className="text-xl md:text-2xl font-semibold text-[#5D4A38] leading-tight">
                    Hỏi đáp về y học cổ truyền
                  </h1>
                  <p className="text-sm md:text-base text-[#5D4A38] opacity-80">
                    Kết nối tri thức y học cổ truyền với công nghệ hiện đại
                  </p>
                </div>

                <div className="flex-none">
                  <UserProfile />
                </div>
              </div>

              {/* Mobile menu for API key settings */}
              <div className="md:hidden flex items-center justify-center border-t border-[#E6DFD1] p-2">
                <button
                  onClick={() => setShowApiSettings(true)}
                  className="flex items-center px-3 py-1.5 text-sm text-[#78A161] hover:text-[#5D4A38] hover:bg-[#78A16115] rounded-md transition-all"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Cài đặt API Key
                </button>
              </div>
            </header>
            
            {/* Beta warning banner */}
            <div className="bg-yellow-50 text-yellow-800 p-3 text-center text-sm rounded-md my-4 mx-2 border border-yellow-200">
              ⚠️ Đây là phiên bản beta của chatbot. Các tính năng và phản hồi có thể bị giới hạn hoặc đang trong giai đoạn thử nghiệm.
            </div>
            
            {/* API Key warning banner */}
            {!hasStoredApiKey() && user && (
              <div className="bg-red-50 text-red-800 p-4 text-center rounded-md my-4 mx-2 border border-red-200 flex flex-col items-center">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-medium">Chưa cấu hình API Key</span>
                </div>
                <p className="text-sm mb-3">
                  Bạn cần cấu hình Anthropic API Key để bắt đầu sử dụng ứng dụng. API Key được sử dụng để kết nối với Claude AI.
                </p>
                <button
                  onClick={() => setShowApiSettings(true)}
                  className="bg-red-100 hover:bg-red-200 text-red-800 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Cấu hình API Key
                </button>
              </div>
            )}
            
            {/* Persona selector container */}
            <div className="flex justify-center md:justify-end px-2 pb-2">
              <TailwindPersonaSelector
                onSelectPersona={onSelectPersona}
                socket={socket}
                selectedPersonaId={selectedPersonaId}
                isLocked={isPersonaLocked}
              />
            </div>

            {/* Scrollable chat area - takes remaining height */}
            <div className="flex-1 overflow-y-auto my-[10px] pb-[80px] relative bg-white/50 rounded-lg">
              {/* Chat display */}
              <div id="yitam-chat-container" className="flex flex-col p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] chat-messages-container">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-[#3A2E22] opacity-60 text-[1.1rem]">
                    {user ? `Xin chào ${user.name}! ` : 'Xin chào! '}
                    {(AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0]).displayName} đang lắng nghe!
                  </div>
                ) : (
                  sortedMessages.map((message) => (
                    <div 
                      key={message.id} 
                      className={`mb-3 ${message.isBot ? 'self-start' : 'self-end'} max-w-[80%] ${!message.isBot ? 'ml-auto' : ''}`}
                      style={{ display: 'block' }}
                      data-message-id={message.id}
                      data-message-type={message.isBot ? 'bot' : 'user'}
                      data-is-streaming={message.isStreaming ? 'true' : 'false'}
                    >
                      <div 
                        className={`p-[10px_14px] rounded-[8px] text-[0.95rem] leading-[1.5] ${
                          message.isBot 
                            ? 'bg-[#F2EEE5] text-[#3A2E22] rounded-[0_8px_8px_8px]' 
                            : 'bg-[#5D4A38] text-white rounded-[8px_8px_0_8px]'
                        }`}
                      >
                        {message.isBot ? (
                          <div className="prose prose-sm max-w-none prose-headings:my-2 prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-ul:pl-6 prose-ol:my-2 prose-ol:pl-6 prose-li:my-1 prose-code:bg-[rgba(93,74,56,0.1)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-pre:bg-[rgba(93,74,56,0.1)] prose-pre:p-4 prose-pre:rounded-lg prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:code:bg-transparent prose-pre:code:p-0">
                            {(() => {
                              // Try to parse message text as JSON if it looks like JSON
                              if (message.text.trim().startsWith('{')) {
                                try {
                                  const parsedError = JSON.parse(message.text);
                                  if (parsedError.type && parsedError.message) {
                                    return (
                                      <div className={`flex items-start gap-3 ${
                                        parsedError.type === 'credit_balance' 
                                          ? 'text-red-700' 
                                          : parsedError.type === 'rate_limit' 
                                            ? 'text-orange-700' 
                                            : 'text-[#3A2E22]'
                                      }`}>
                                        {parsedError.type === 'credit_balance' && (
                                          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h.01M11 15h.01M15 15h.01M19 15h.01M7 19h.01M11 19h.01M15 19h.01M19 19h.01M7 11h.01M11 11h.01M15 11h.01M19 11h.01M7 7h.01M11 7h.01M15 7h.01M19 7h.01" />
                                          </svg>
                                        )}
                                        {parsedError.type === 'rate_limit' && (
                                          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        )}
                                        <div className="flex-1">
                                          <p className="m-0">{parsedError.message}</p>
                                          {parsedError.type === 'credit_balance' && (
                                            <a 
                                              href="https://console.anthropic.com/account/billing" 
                                              target="_blank" 
                                              rel="noopener noreferrer" 
                                              className="inline-flex items-center text-sm mt-2 text-red-700 hover:text-red-800 font-medium"
                                            >
                                              Đi đến trang thanh toán
                                              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                              </svg>
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }
                                } catch (e) {
                                  // If parsing fails, fall back to regular message display
                                }
                              }
                              
                              // Default message display
                              return <TailwindToolCallParser text={message.text} />;
                            })()}
                            {message.isStreaming && (
                              <span className="inline-flex items-center ml-1.5">
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap text-white">{message.text}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 ml-2 mt-1">
                        {message.isBot 
                          ? (AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0]).displayName
                          : 'Bạn'
                        }
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Show sample questions when appropriate */}
              {messages.length === 1 && messages[0].id === 'welcome' && !hasUserSentMessage && (
                <TailwindSampleQuestions 
                  onQuestionClick={(question) => {
                    console.log('Sample question clicked:', question);
                    sendMessage(question);
                  }} 
                  socket={socket} 
                  limit={questionsLimit}
                />
              )}
            </div>

            {/* CSS for the dots animation */}
            <style>{`
              .typing-dot {
                display: inline-block;
                width: 6px;
                height: 6px;
                margin: 0 2px;
                background-color: #777;
                border-radius: 50%;
                animation: typing-animation 1.4s infinite ease-in-out both;
              }
              
              .typing-dot:nth-child(1) {
                animation-delay: 0s;
              }
              
              .typing-dot:nth-child(2) {
                animation-delay: 0.2s;
              }
              
              .typing-dot:nth-child(3) {
                animation-delay: 0.4s;
              }
              
              @keyframes typing-animation {
                0%, 80%, 100% { 
                  transform: scale(0.6);
                  opacity: 0.6;
                }
                40% { 
                  transform: scale(1);
                  opacity: 1;
                }
              }
            `}</style>

            {/* Message input - fixed at bottom */}
            <div 
              ref={inputRef} 
              className="sticky bottom-0 bg-[#FDFBF6] pt-2 z-10 w-full transition-all duration-300 ease-in-out"
            >
              <TailwindMessageInput 
                onSendMessage={(text) => {
                  console.log('Message input:', text);
                  sendMessage(text);
                }} 
                disabled={!isConnected} 
              />
              
              {/* Footer with the New Chat button added */}
              <footer className="bg-[#F5EFE0] mt-2 py-2 px-3 flex flex-col border-t border-[#E6DFD1] rounded shadow-[0_-1px_1px_rgba(0,0,0,0.05)] min-h-[45px]">
                <div className="flex justify-between items-center">
                  <div className="flex items-center flex-1">
                    <div className={`text-sm font-medium px-2 py-1 rounded ${
                      isConnected 
                        ? 'bg-[rgba(120,161,97,0.2)] text-[#78A161]' 
                        : 'bg-[rgba(188,71,73,0.2)] text-[#BC4749]'
                    }`}>
                      {isConnected ? 'Sẵn sàng' : 'Ngoại tuyến'}
                    </div>
                    
                    {/* Bigger New Chat button in the footer */}
                    {messages.length > 1 ? (
                      <button
                        onClick={startNewChat}
                        disabled={isBotResponding}
                        className={`ml-3 flex items-center text-sm font-medium py-1.5 px-3 rounded-md transition-all duration-200 ${
                          isBotResponding 
                            ? 'bg-[#E6DFD1] text-[#9E9689] cursor-not-allowed opacity-80' 
                            : 'bg-[#78A161] text-white hover:bg-[#5D8A46] shadow-sm hover:shadow'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Cuộc trò chuyện mới
                      </button>
                    ) : (
                      <div className="ml-3 py-1.5 px-3 invisible">Placeholder</div>
                    )}
                  </div>
                  
                  <a 
                    href="https://github.com/sponsors/hadv" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center text-sm font-medium text-[#78A161] bg-[rgba(120,161,97,0.1)] hover:bg-[rgba(120,161,97,0.2)] px-2 py-1 rounded transition-all hover:scale-105 ml-2"
                  >
                    <span className="text-[#BC4749] mr-1.5 text-base">♥</span>
                    <span className="leading-none">Hỗ trợ dự án</span>
                  </a>
                </div>
                <div className="text-right text-xs text-[#5D4A38] opacity-70 mt-2">
                  © {new Date().getFullYear()} Toàn bộ bản quyền thuộc Yitam
                </div>
              </footer>
            </div>
          </div>

          {/* API Settings Modal */}
          {showApiSettings && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="relative w-full max-w-xl animate-fade-in">
                <button
                  onClick={() => setShowApiSettings(false)}
                  className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <TailwindApiKeySettings 
                  onApiKeySet={() => {
                    setShowApiSettings(false);
                    // Reconnect socket with new API key
                    if (user) {
                      const newSocket = connectSocket(user);
                      if (newSocket) {
                        if (socket) {
                          socket.disconnect();
                        }
                        setSocket(newSocket);
                      }
                    }
                  }}
                  socket={socket || undefined}
                />
              </div>
            </div>
          )}
              
              {/* Topic Manager Modal */}
              {showTopicManager && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl animate-fade-in">
                    <div className="flex justify-between items-center p-6 border-b border-[#E6DFD1]">
                      <h2 className="text-2xl font-semibold text-[#3A2E22]">Quản lý cuộc trò chuyện</h2>
                      <button
                        onClick={() => setShowTopicManager(false)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
        </div>
                    
                    <div className="p-6 max-h-[70vh] overflow-auto">
                      <TailwindTopicManager
                        userId={user.email}
                        currentTopicId={currentTopicId}
                        onSelectTopic={(topicId: number) => {
                          handleTopicSelect(topicId);
                          setShowTopicManager(false);
                        }}
                      />
                    </div>
                    
                    {storageUsage && storageUsage.percentage > 0 && (
                      <div className="p-4 border-t border-[#E6DFD1]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-[#5D4A38]">
                            Dung lượng lưu trữ: {(storageUsage.usage / (1024 * 1024)).toFixed(1)} MB / {(storageUsage.quota / (1024 * 1024)).toFixed(1)} MB
                          </span>
                          <span className={`text-sm font-medium ${
                            storageUsage.percentage > 80 ? 'text-red-600' : 
                            storageUsage.percentage > 60 ? 'text-amber-600' : 'text-[#78A161]'
                          }`}>
                            {storageUsage.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              storageUsage.percentage > 80 ? 'bg-red-500' : 
                              storageUsage.percentage > 60 ? 'bg-amber-500' : 'bg-[#78A161]'
                            }`}
                            style={{ width: `${Math.min(100, storageUsage.percentage)}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TailwindMessagePersistence>
        </ChatHistoryProvider>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 