// Add this at the top of the file, before the imports

// Extend Window interface to include our debugging functions
declare global {
  interface Window {
    getCurrentPersonaId?: () => string;
    absoluteForcePersona?: (personaId: string) => void;
    debugPersonaSystem?: () => Promise<any>;
    checkTopicPersonaConsistency?: () => Promise<any>;
    fixTopicPersonas?: (defaultPersona?: string) => Promise<any>;
    exportTopic?: (topicId: number) => Promise<any>;
    testTitleExtraction?: (text: string) => string;
    lastUsedPersona?: string;
  }
}

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
// Import the persona context
import { usePersona } from '../../contexts/PersonaContext';
// Remove persona debugger import

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
  personaId?: string;
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

// First, improve the title extraction function to better handle tool calls
const extractTitleFromBotText = (botText: string): string => {
  if (!botText || botText.trim() === '') {
    return "New Conversation";
  }
  
  console.log(`[TITLE EXTRACT] Starting title extraction on text of length ${botText.length}`);
  
  // First, remove any tool calls from the bot text
  let cleanedText = botText;
  
  // Match and remove tool calls
  const toolCallPatterns = [
    /<function_calls>[\s\S]*?<\/antml:function_calls>/gi,
    /<function_call>[\s\S]*?<\/function_call>/gi,
    /<tool_call>[\s\S]*?<\/tool_call>/gi
  ];
  
  for (const pattern of toolCallPatterns) {
    cleanedText = cleanedText.replace(pattern, '');
  }
  
  // Clean up any remaining XML/HTML-like tags that might be left
  cleanedText = cleanedText.replace(/<[^>]*>/g, '');
  
  // Log the first part of cleaned text
  const previewLength = Math.min(cleanedText.length, 200);
  console.log(`[TITLE EXTRACT] Cleaned text (first ${previewLength} chars): "${cleanedText.substring(0, previewLength)}..."`);
  
  // Split into lines for better processing
  const lines = cleanedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Look for markdown headers with priority:
  // 1. First # header (most important - this is what we want)
  // 2. First ## header (secondary)
  // 3. Any other header
  
  // First, try to find # headers (h1)
  const h1Lines = lines.filter(line => /^#\s+\S+/.test(line));
  if (h1Lines.length > 0) {
    const h1Text = h1Lines[0].replace(/^#\s+/, '').trim()
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '') // Remove bold/italic
      .replace(/^`|`$/g, '') // Remove code ticks
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, ''); // Remove emojis
    
    console.log(`[TITLE EXTRACT] Using H1 header as title: "${h1Text}"`);
    return h1Text;
  }
  
  // If no h1, try h2
  const h2Lines = lines.filter(line => /^##\s+\S+/.test(line));
  if (h2Lines.length > 0) {
    const h2Text = h2Lines[0].replace(/^##\s+/, '').trim()
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, '');
    
    console.log(`[TITLE EXTRACT] Using H2 header as title: "${h2Text}"`);
    return h2Text;
  }
  
  // If no h1 or h2, try any header (h3-h6)
  const anyHeaderLines = lines.filter(line => /^#{3,6}\s+\S+/.test(line));
  if (anyHeaderLines.length > 0) {
    const headerText = anyHeaderLines[0].replace(/^#{3,6}\s+/, '').trim()
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, '');
    
    console.log(`[TITLE EXTRACT] Using other header as title: "${headerText}"`);
    return headerText;
  }
  
  // If no headers at all, use the first line that's not a list item or details
  // Exclude lines that look like list items, code blocks, or other non-title content
  const nonListLines = lines.filter(line => 
    !line.startsWith('- ') && 
    !line.startsWith('* ') && 
    !line.startsWith('+ ') && 
    !line.match(/^\d+\.\s/) &&
    !line.startsWith('```') &&
    !line.startsWith('&gt;') &&
    !line.startsWith('>') &&
    !line.startsWith('|')
  );
  
  if (nonListLines.length > 0) {
    // Get the first non-list line and clean it
    const firstLine = nonListLines[0]
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, '');
    
    // Truncate if needed
    const title = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
    console.log(`[TITLE EXTRACT] Using first non-list line as title: "${title}"`);
    return title;
  }
  
  // Absolute fallback - use the first line no matter what
  if (lines.length > 0) {
    const fallbackTitle = lines[0].substring(0, 100).trim();
    console.log(`[TITLE EXTRACT] Using fallback first line as title: "${fallbackTitle}"`);
    return fallbackTitle;
  }
  
  return "New Conversation";
};

// Add a global test function to check title extraction
(window as any).testTitleExtraction = (text: string) => {
  console.log("Test Title Extraction for:", text.substring(0, 50) + "...");
  return extractTitleFromBotText(text);
};

// Add this before the component declaration
const debugLogger = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${category} ${timestamp}] ${message}${data !== undefined ? ': ' + JSON.stringify(data) : ''}`);
};

function TailwindApp() {
  const [socket, setSocket] = useState<Socket<DefaultEventsMap, DefaultEventsMap> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [questionsLimit] = useState(6);
  
  // CRITICAL FIX: Use the PersonaContext with forceSetPersona
  const { 
    currentPersonaId,
    setCurrentPersonaId,
    isPersonaLocked,
    setIsPersonaLocked,
    resetPersona,
    forceSetPersona,
    absoluteForcePersona
  } = usePersona();
  
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [currentTopicId, setCurrentTopicId] = useState<number | undefined>(undefined);
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

  // Add an effect to monitor and log persona changes
  useEffect(() => {
    console.log(`[PERSONA MONITOR] Current persona changed to: ${currentPersonaId}`);
    
    // If we have messages, update the first message to reflect the current persona
    if (messages.length === 1 && messages[0].id === 'welcome' && !hasUserSentMessage && !isPersonaLocked) {
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
      const welcomeText = user ? 
        `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!` : 
        `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`;
      
      // Only update if the text is different to prevent loops
      if (messages[0].text !== welcomeText) {
        updateMessages([{
          id: 'welcome',
          text: welcomeText,
          isBot: true,
          timestamp: Date.now()
        }]);
      }
    }
  }, [currentPersonaId]);

  // Effect for welcome message - separate from socket effect
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'welcome' && !hasUserSentMessage) {
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
      if (user && messages[0].text !== `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`) {
        updateMessages([{
          id: 'welcome',
          text: `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`,
          isBot: true
        }]);
      }
    }
  }, [currentPersonaId, user, hasUserSentMessage]);

  // Fix issue #1: Topic title extraction logic
  // Modify the title extraction in the generateTopicTitle function
  const generateTopicTitle = useCallback(async (topicId: number, conversationText?: string) => {
    if (!isDBReady) {
      console.error('[TITLE GEN] Cannot generate title: DB not ready');
      return "New Conversation";
    }
    
    try {
      console.log(`[TITLE GEN] Starting title generation for topic ${topicId}`);
      
      // If specific conversation text was provided, use it, otherwise get messages for the topic
      let finalConversationText = conversationText;
      
      if (!finalConversationText) {
        // Get the topic to check if it already has a custom title
        const topic = await db.topics.get(topicId);
        if (!topic) {
          console.error(`[TITLE GEN] Cannot generate title: Topic ${topicId} not found in database`);
          return "New Conversation";
        }
        
        if (topic.title !== "New Conversation") {
          console.log(`[TITLE GEN] Topic ${topicId} already has a title: "${topic.title}". Skipping title generation.`);
          return topic.title;
        }
        
        // Get messages for this topic
        const messages = await db.messages
          .where('topicId')
          .equals(topicId)
          .toArray();
        
        console.log(`[TITLE GEN] Found ${messages.length} messages for topic ${topicId}`);
        
        // Only generate a title if we have at least 2 messages (1 user, 1 assistant)
        if (messages.length < 2) {
          console.log(`[TITLE GEN] Not enough messages (${messages.length}) to generate a title. Skipping.`);
          return "New Conversation";
        }
        
        // Extract the conversation content
        finalConversationText = messages
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
      }
      
      if (!finalConversationText || finalConversationText.trim().length < 10) {
        console.log(`[TITLE GEN] Conversation text too short or empty for title generation`);
        return "New Conversation";
      }
      
      // Local title extraction instead of server request
      // First look for the first assistant message
      const lines = finalConversationText.split('\n\n');
      let assistantResponses = lines.filter(line => line.startsWith('Assistant:'));
      
      if (assistantResponses.length === 0) {
        console.log(`[TITLE GEN] No assistant responses found, using default title`);
        return "New Conversation";
      }
      
      // Get the first assistant response
      const firstResponse = assistantResponses[0].replace('Assistant:', '').trim();
      
      // First priority: Look for markdown headers
      const headerMatches = firstResponse.match(/^(#+)\s+(.+)$/m);
      if (headerMatches && headerMatches[2]) {
        // Clean the header text
        let headerText = headerMatches[2].trim();
        // Remove formatting
        headerText = headerText.replace(/^\*\*|\*\*$|^\*|\*$/g, ''); // Remove bold/italic
        headerText = headerText.replace(/^`|`$/g, ''); // Remove code ticks
        headerText = headerText.replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, ''); // Remove emojis
        
        console.log(`[TITLE GEN] Using markdown header as title: "${headerText}"`);
        
        // Update the topic title in the database
        if (topicId > 0) {
          await db.topics.update(topicId, { title: headerText });
          console.log(`[TITLE GEN] Updated topic title in database to: "${headerText}"`);
        }
        
        return headerText;
      }
      
      // Second priority: Use the first line of the response
      const responseLines = firstResponse.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (responseLines.length > 0) {
        let firstLine = responseLines[0];
        // Clean the first line
        firstLine = firstLine.replace(/^\*\*|\*\*$|^\*|\*$/g, ''); // Remove bold/italic
        firstLine = firstLine.replace(/^`|`$/g, ''); // Remove code ticks
        firstLine = firstLine.replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, ''); // Remove emojis
        
        // Truncate if necessary
        const title = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
        console.log(`[TITLE GEN] Using first line as title: "${title}"`);
        
        // Update the topic title in the database
        if (topicId > 0) {
          await db.topics.update(topicId, { title: title });
          console.log(`[TITLE GEN] Updated topic title in database to: "${title}"`);
        }
        
        return title;
      }
      
      // Default title
      return "New Conversation";
      
    } catch (error) {
      console.error('[TITLE GEN] Error generating topic title:', error);
      return "New Conversation";
    }
  }, [isDBReady]);

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

  // Fix issue #2: Prevent empty topics
  // Update the ensureTopicExists function to be more strict
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
          // We won't create a new topic here anymore - will create after bot response
          return undefined;
        }
      } catch (error) {
        console.error(`[TOPIC DEBUG] Error verifying topic ${topicId}:`, error);
        return undefined;
      }
    }
    
    // Return undefined - topics will be created after bot response
    console.log('[TOPIC DEBUG] No topic exists yet, will create after bot response');
    return undefined;
  }, []);

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

      newSocket.on('bot-response-end', async (response: { id: string, error?: boolean, errorMessage?: string }) => {
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
          
          // CRITICAL FIX: Add direct topic creation here - only proceed if we have a user
          if (!user) {
            console.log('[TOPIC DEBUG] No user available, skipping topic creation');
            return;
          }
          
          console.log('[TOPIC DEBUG] Starting direct topic creation after bot response');
          
          // CRITICAL FIX: Find the actual persona that was selected when the user sent the message
          // We need to find the user message that came before this bot response
          const allMessages = pendingMessagesRef.current;
          const messageIndex = allMessages.findIndex(msg => msg.id === botMessage?.id);
          const precedingMessages = messageIndex > 0 ? allMessages.slice(0, messageIndex) : [];
          const lastUserMessage = [...precedingMessages].reverse().find(msg => !msg.isBot);
          
          if (!lastUserMessage) {
            console.log('[TOPIC DEBUG] No user message found, skipping topic creation');
            return;
          }
          
          // Get the persona ID to use for the topic
          // 1. First check if we already have a topic with a persona
          let personaIdForTopic = currentPersonaId;
          
          // Check if the user message has a stored personaId
          if ((lastUserMessage as any).personaId) {
            const msgPersonaId = (lastUserMessage as any).personaId;
            console.log(`[TOPIC DEBUG] Found persona ID stored in message: ${msgPersonaId}`);
            
            // Verify it's valid
            const isMsgPersonaValid = AVAILABLE_PERSONAS.some(p => p.id === msgPersonaId);
            if (isMsgPersonaValid) {
              console.log(`[TOPIC DEBUG] Using persona from message: ${msgPersonaId}`);
              personaIdForTopic = msgPersonaId;
            } else {
              console.log(`[TOPIC DEBUG] Persona ID in message is invalid: ${msgPersonaId}`);
            }
          }
          
          // 2. Check if we have an existing topic with a persona
          if (currentTopicRef.current) {
            try {
              const existingTopic = await db.topics.get(currentTopicRef.current);
              if (existingTopic && existingTopic.personaId) {
                // If topic already exists, use its persona
                personaIdForTopic = existingTopic.personaId;
                console.log(`[TOPIC DEBUG] Using existing topic's persona: ${personaIdForTopic}`);
              }
            } catch (e) {
              console.error('[TOPIC DEBUG] Error checking existing topic:', e);
            }
          }
          
          // Verify the persona ID is valid
          const isValidPersonaId = AVAILABLE_PERSONAS.some(p => p.id === personaIdForTopic);
          if (!isValidPersonaId) {
            console.error(`[TOPIC DEBUG] Invalid persona ID: ${personaIdForTopic}, falling back to yitam`);
            personaIdForTopic = 'yitam';
          }
          
          // CRITICAL FIX: Check if we already have a topic - we should NOT create a new one
          if (currentTopicRef.current) {
            console.log(`[TOPIC DEBUG] Topic already exists (${currentTopicRef.current}), updating with message`);
            
            try {
              // Get the existing topic
              const existingTopic = await db.topics.get(currentTopicRef.current);
              
              if (existingTopic) {
                // CRITICAL: Use the topic's existing persona ID, NOT the current UI persona
                // This ensures we don't override the topic's persona
                const topicPersona = existingTopic.personaId || personaIdForTopic;
                
                console.log(`[TOPIC DEBUG] Existing topic has persona: ${topicPersona}`);
                
                // Update the existing topic with current values
                await db.topics.update(currentTopicRef.current, {
                  lastActive: Date.now(),
                  messageCnt: (existingTopic.messageCnt || 0) + 1,
                  assistantMessageCnt: (existingTopic.assistantMessageCnt || 0) + 1,
                  totalTokens: (existingTopic.totalTokens || 0) + Math.ceil(botMessage.text.length / 4)
                });
                
                // Save the bot message to the existing topic
                await db.messages.put({
                  id: Date.now(),
                  topicId: currentTopicRef.current,
                  timestamp: botMessage.timestamp || Date.now(),
                  role: 'assistant',
                  content: botMessage.text,
                  type: 'text',
                  tokens: Math.ceil(botMessage.text.length / 4),
                  modelVersion: 'claude-3'
                });
                
                console.log(`[TOPIC DEBUG] Added message to existing topic ${currentTopicRef.current}`);
                
                // CRITICAL: Make sure the UI shows the correct persona for this topic
                absoluteForcePersona(topicPersona);
                setIsPersonaLocked(true);
                
                return;
              }
            } catch (error) {
              console.error('[TOPIC DEBUG] Error accessing existing topic:', error);
              // Continue with creating a new topic as fallback
            }
          }
          
          // Extract title from bot message
          const extractedTitle = extractTitleFromBotText(botMessage.text);
          console.log(`[TOPIC DEBUG] Extracted title: "${extractedTitle}"`);
          
          // Use a timestamp for all operations
          const timestamp = Date.now();
          
          // CRITICAL FIX: Final verification to ensure we have a valid persona
          // This is the LAST check before creating the topic
          const finalPersonaId = isValidPersonaId ? personaIdForTopic : 'yitam';
          console.log(`[TOPIC DEBUG] Creating new topic with persona: ${finalPersonaId}`);
          
          // Create topic with PUT instead of ADD
          await db.topics.put({
            id: timestamp,
            userId: user.email,
            title: extractedTitle,
            createdAt: timestamp,
            lastActive: timestamp,
            messageCnt: 2,
            userMessageCnt: 1,
            assistantMessageCnt: 1,
            totalTokens: Math.ceil(lastUserMessage.text.length / 4) + Math.ceil(botMessage.text.length / 4),
            model: 'claude-3',
            systemPrompt: '',
            pinnedState: false,
            personaId: finalPersonaId // CRITICAL: Use the final verified persona ID
          });
          
          const topicId = timestamp;
          console.log(`[TOPIC DEBUG] Successfully created topic with forced ID: ${topicId} and persona: ${finalPersonaId}`);
          
          // CRITICAL: Verify the topic was created with the correct persona
          const createdTopic = await db.topics.get(topicId);
          if (createdTopic) {
            if (createdTopic.personaId !== finalPersonaId) {
              console.error(`[TOPIC DEBUG] PERSONA MISMATCH: Expected ${finalPersonaId}, got ${createdTopic.personaId}`);
              
              // Fix the persona ID if it doesn't match
              await db.topics.update(topicId, { personaId: finalPersonaId });
              console.log(`[TOPIC DEBUG] Forced persona update to: ${finalPersonaId}`);
            } else {
              console.log(`[TOPIC DEBUG] Verified topic ${topicId} created with correct persona: ${createdTopic.personaId}`);
            }
          }
          
          // CRITICAL: Update both state and ref immediately
          ReactDOM.unstable_batchedUpdates(() => {
            setCurrentTopicId(topicId);
            currentTopicRef.current = topicId;
            // Make sure we lock the persona since we now have a topic
            setIsPersonaLocked(true);
            // CRITICAL: Force the persona to be correct
            absoluteForcePersona(finalPersonaId);
          });
          
          // Save user message with put
          await db.messages.put({
            id: timestamp + 1,
            topicId: topicId,
            timestamp: lastUserMessage.timestamp || timestamp - 1000,
            role: 'user',
            content: lastUserMessage.text,
            type: 'text',
            tokens: Math.ceil(lastUserMessage.text.length / 4)
          });
          
          // Save bot message with put
          await db.messages.put({
            id: timestamp + 2,
            topicId: topicId,
            timestamp: botMessage.timestamp || timestamp,
            role: 'assistant',
            content: botMessage.text,
            type: 'text',
            tokens: Math.ceil(botMessage.text.length / 4),
            modelVersion: 'claude-3'
          });
          
          console.log(`[TOPIC DEBUG] Successfully saved both messages to topic ${topicId}`);
          
          // FINAL verification that the correct persona is set
          setTimeout(() => {
            if (currentPersonaId !== finalPersonaId) {
              console.error(`[PERSONA DEBUG] Final verification failed. Expected: ${finalPersonaId}, got: ${currentPersonaId}`);
              absoluteForcePersona(finalPersonaId);
            } else {
              console.log('[PERSONA DEBUG] Final verification passed: Persona is correctly set');
            }
          }, 200);
        } catch (error) {
          console.error('[TOPIC DEBUG] Error in DIRECT topic creation:', error);
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
      // Don't reset the persona to default - preserve user's selection
      // setCurrentPersonaId('yitam');
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
    
    // Capture the current UI-selected persona
    const capturedPersonaId = currentPersonaId;
    console.log(`[PERSONA DEBUG] Captured persona ID at message send time: ${capturedPersonaId}`);
    
    const userMessage: Message = {
      id: `user-${timestamp}-${randomId}`,
      text,
      isBot: false,
      timestamp,
      // Add the persona ID as a non-enumerable property to prevent JSON issues
      personaId: capturedPersonaId
    } as Message & { personaId: string };
    
    // Update UI state
    setHasUserSentMessage(true);
    // Lock the persona using context
    setIsPersonaLocked(true);
    setMessages(prevMessages => [...prevMessages, userMessage]);
    pendingMessagesRef.current = [...pendingMessagesRef.current, userMessage];
    
    // CRITICAL FIX: Check if we're in an existing topic and save the message to the database
    if (currentTopicRef.current) {
      const topicId = currentTopicRef.current;
      
      // Immediately save the user message to the database
      (async () => {
        try {
          // Verify the topic exists and get its details
          const topic = await db.topics.get(topicId);
          
          if (!topic) {
            console.error(`[TOPIC DEBUG] Cannot save message - topic ${topicId} not found`);
            return;
          }
          
          // CRITICAL: Check if the topic has a persona ID
          if (!topic.personaId) {
            // Set the topic's persona to the current UI persona
            console.log(`[PERSONA DEBUG] Topic ${topicId} has no persona ID, setting to current: ${currentPersonaId}`);
            await db.topics.update(topicId, { personaId: currentPersonaId });
          } else if (topic.personaId !== currentPersonaId) {
            // CRITICAL FIX: If the topic's persona differs from the current UI persona,
            // update the UI to match the topic's persona
            console.log(`[PERSONA DEBUG] Topic persona (${topic.personaId}) differs from UI persona (${currentPersonaId}), correcting UI...`);
            absoluteForcePersona(topic.personaId);
            
            // Verify the correction worked
            setTimeout(() => {
              if (currentPersonaId !== topic.personaId) {
                console.error(`[PERSONA DEBUG] Failed to sync UI persona with topic persona. UI: ${currentPersonaId}, Topic: ${topic.personaId}`);
                // Try one more time
                absoluteForcePersona(topic.personaId!);
              } else {
                console.log(`[PERSONA DEBUG] Successfully synced UI persona with topic persona: ${currentPersonaId}`);
              }
            }, 50);
          }
          
          // Save the user message
          await db.messages.put({
            id: timestamp,
            topicId: topicId,
            timestamp: timestamp,
            role: 'user',
            content: text,
            type: 'text',
            tokens: Math.ceil(text.length / 4)
          });
          
          // Update topic statistics
          await db.topics.update(topicId, {
            lastActive: timestamp,
            messageCnt: (topic.messageCnt || 0) + 1,
            userMessageCnt: (topic.userMessageCnt || 0) + 1,
            totalTokens: (topic.totalTokens || 0) + Math.ceil(text.length / 4)
          });
          
          console.log(`[TOPIC DEBUG] Saved user message to existing topic ${topicId}`);
        } catch (error) {
          console.error('[TOPIC DEBUG] Error saving user message to database:', error);
        }
      })();
    } else {
      console.log('[TOPIC DEBUG] No existing topic, message will be saved after bot response');
    }
    
    // CRITICAL FIX: Store the ACTUAL current persona for the request
    // This ensures we capture the exact persona the user has selected
    // We MUST create a local variable and print it to ensure it's correct
    const actualCurrentPersona = capturedPersonaId;
    console.log(`[PERSONA DEBUG] CRITICAL: Captured actual current persona: ${actualCurrentPersona}`);
    
    // Find the selected persona for domains
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === actualCurrentPersona) || AVAILABLE_PERSONAS[0];
    console.log(`[PERSONA DEBUG] Selected persona: ${selectedPersona.displayName} (${actualCurrentPersona})`);
    
    // Send the message to the server with the current persona ID
    socket.emit('chat-message', {
      message: text,
      personaId: actualCurrentPersona,
      domains: selectedPersona.domains
    });
    
    console.log(`[PERSONA DEBUG] Message sent with persona: ${actualCurrentPersona}`);
  }, [socket, setMessages, currentPersonaId, setIsPersonaLocked, absoluteForcePersona]);

  // Function to start a new chat
  const startNewChat = useCallback(() => {
    // Clear current topic
    setCurrentTopicId(undefined);
    currentTopicRef.current = undefined;
    
    // Reset the persona state - this will load the default from localStorage
    resetPersona();
    
    // Find selected persona using the now-reset persona ID
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
    
    // Create welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      text: user 
        ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`
        : `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
      isBot: true,
      timestamp: Date.now()
    };
    
    // Reset message state
    lastMessageRef.current = null;
    pendingMessagesRef.current = [welcomeMessage];
    setMessages([welcomeMessage]);
    setHasUserSentMessage(false);
    
    console.log(`[PERSONA DEBUG] New chat started with default persona: ${currentPersonaId}`);
  }, [currentPersonaId, resetPersona, user]);

  // Initialize messages when component mounts or user changes - SHOW WELCOME WITHOUT CREATING TOPIC
  useEffect(() => {
    if (messages.length === 0 && user) {
      console.log('Initializing welcome message without creating topic...');
      
      // Create welcome message only (no topic creation)
      const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
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
      
      console.log(`[PERSONA DEBUG] Initialized with persona: ${currentPersonaId}, display name: ${selectedPersona.displayName}`);
    }
  }, [messages.length, user, currentPersonaId]);

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

  // Modify onSelectPersona to use the PersonaContext
  const onSelectPersona = (personaId: string) => {
    console.log(`Selected persona: ${personaId}`);
    // This already checks if locked inside the context
    setCurrentPersonaId(personaId);
  };

  // Check if any bot message is currently streaming
  const isBotResponding = messages.some(msg => msg.isBot && msg.isStreaming);

  // Check if API key is stored
  const hasStoredApiKey = () => {
    const apiKey = decryptApiKey();
    return !!apiKey;
  };

  // Fix issue #3: Fix persona for topics
  // Update the handleTopicSelect function to properly handle persona selection
  const handleTopicSelect = useCallback(async (topicId: number) => {
    try {
      // Handle special case when no topics exist (-1)
      if (topicId === -1) {
        console.log('[PERSONA DEBUG] No topics exist, resetting chat to fresh state');
        // Clear current topic
        setCurrentTopicId(undefined);
        currentTopicRef.current = undefined;
        
        // Reset to default persona from localStorage
        resetPersona();
        
        const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
        const welcomeMessage = {
          id: 'welcome',
          text: user ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!` : 
                    `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
          isBot: true,
          timestamp: Date.now()
        };
        
        updateMessages([welcomeMessage]);
        setHasUserSentMessage(false);
        return;
      }
      
      console.log('[PERSONA DEBUG] Loading topic:', topicId);
      
      try {
        // Get the topic synchronously - CRITICAL: this needs to be loaded first
        // and we need to wait for it before proceeding
        const topic = await db.topics.get(topicId);
        
        if (!topic) {
          console.error(`[PERSONA DEBUG] Topic ${topicId} not found`);
          return;
        }
        
        console.log(`[PERSONA DEBUG] Found topic: ${topic.title} (ID: ${topicId})`);
        
        // CRITICAL FIX: Verify topic has a persona ID
        if (!topic.personaId) {
          console.warn(`[PERSONA DEBUG] Topic ${topicId} has no persona ID, will assign current UI persona: ${currentPersonaId}`);
          
          // Update the topic with the current persona
          await db.topics.update(topicId, { 
            personaId: currentPersonaId,
            lastActive: Date.now() 
          });
          
          // Re-fetch the topic to ensure we have the updated version
          const updatedTopic = await db.topics.get(topicId);
          if (updatedTopic && updatedTopic.personaId) {
            console.log(`[PERSONA DEBUG] Topic ${topicId} now has persona ID: ${updatedTopic.personaId}`);
            topic.personaId = updatedTopic.personaId;
          }
        } else {
          console.log(`[PERSONA DEBUG] Topic ${topicId} has persona ID: ${topic.personaId}`);
          
          // Just update the last active timestamp
          await db.topics.update(topicId, { lastActive: Date.now() });
        }
        
        // CRITICAL: This must be BEFORE loading messages or setting any UI elements
        // First set the topic ID so it's updated before we do anything else
        setCurrentTopicId(topicId);
        currentTopicRef.current = topicId;
        
        // CRITICAL FIX: Get the topic's persona ID
        const topicPersonaId = topic.personaId || currentPersonaId;
        console.log(`[PERSONA DEBUG] Setting persona from topic: ${topicPersonaId}`);
        
        // CRITICAL FIX: Use the new absoluteForcePersona method which bypasses all restrictions
        // This ensures the UI always shows the correct persona for this topic
        absoluteForcePersona(topicPersonaId);
        
        // Set the lock AFTER setting the persona
        setIsPersonaLocked(true);
        
        // Extra verification to make sure the persona was set correctly
        setTimeout(() => {
          if (currentPersonaId !== topicPersonaId) {
            console.error(`[PERSONA DEBUG] CRITICAL ERROR: Persona not set correctly. Expected: ${topicPersonaId}, actual: ${currentPersonaId}`);
            // Try one more time with forced setter
            absoluteForcePersona(topicPersonaId);
          } else {
            console.log(`[PERSONA DEBUG] Verified persona is set correctly to: ${currentPersonaId}`);
          }
        }, 100);
        
        // Now load messages for this topic
        const topicMessages = await db.messages
          .where('topicId')
          .equals(topicId)
          .sortBy('timestamp');
        
        console.log(`[PERSONA DEBUG] Loaded ${topicMessages.length} messages for topic ${topicId}`);
        
        // Get the persona to use for display - MUST use the topic's persona ID
        const persona = AVAILABLE_PERSONAS.find(p => p.id === topicPersonaId) || AVAILABLE_PERSONAS[0];
        console.log(`[PERSONA DEBUG] Using persona: ${topicPersonaId}, display name: ${persona.displayName}`);
        
        // Convert DB messages to UI format
        const uiMessages = topicMessages.map(dbMsg => ({
          id: `msg-${dbMsg.id || 'unknown'}-${dbMsg.timestamp}`,
          text: dbMsg.content,
          isBot: dbMsg.role === 'assistant',
          timestamp: dbMsg.timestamp
        }));
        
        // If there are no messages, add a welcome message
        if (uiMessages.length === 0) {
          uiMessages.push({
            id: 'welcome',
            text: user ? `Xin chào ${user.name}! ${persona.displayName} đang lắng nghe!` : 
                        `Xin chào! ${persona.displayName} đang lắng nghe!`,
            isBot: true,
            timestamp: Date.now()
          });
        }
        
        // Update the UI with the messages
        updateMessages(uiMessages);
        
        // Set user sent message to avoid showing sample questions
        setHasUserSentMessage(true);
        
        console.log(`[PERSONA DEBUG] Topic ${topicId} fully loaded with persona "${topicPersonaId}"`);
      } catch (dbError) {
        console.error('[PERSONA DEBUG] Database error:', dbError);
        
        // Show an error message to the user
        const errorMessage = {
          id: `error-${Date.now()}`,
          text: 'Không thể tải cuộc trò chuyện. Vui lòng thử lại.',
          isBot: true,
          error: {
            type: 'other' as const,
            message: 'Failed to load conversation'
          }
        };
        
        updateMessages([errorMessage]);
      }
    } catch (error) {
      console.error('[PERSONA DEBUG] Fatal error in handleTopicSelect:', error);
    }
  }, [user, updateMessages, currentPersonaId, absoluteForcePersona, resetPersona, setIsPersonaLocked]);

  // Ensure each topic saves the selected persona in any other relevant places
  // Fix the createNewTopic function
  const createNewTopic = useCallback(async (title: string) => {
    if (!user || !isDBReady) return;
    
    try {
      // Use currentPersonaId directly from context 
      console.log(`[TOPIC DEBUG] Creating new topic with persona: ${currentPersonaId}`);
      
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
        pinnedState: false,
        personaId: currentPersonaId // Ensure we use the current persona
      });
      
      // Set as current topic
      setCurrentTopicId(topicId);
      currentTopicRef.current = topicId;
      
      // Reset message state with welcome message
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
      const welcomeMessage = {
        id: 'welcome',
        text: user ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!` : 
                    `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true
      };
      
      updateMessages([welcomeMessage]);
      
      return topicId;
    } catch (error) {
      console.error('[TOPIC DEBUG] Error creating new topic:', error);
      return undefined;
    }
  }, [user, isDBReady, updateMessages, currentPersonaId]);

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

  // Add a standalone function to handle topic creation after bot response
  const handleBotResponseTopicCreation = useCallback(async (botMessage: Message | null) => {
    if (!botMessage || !isDBReady || !user) {
      console.log('[TOPIC DEBUG] Skipping topic creation - conditions not met:', {
        hasBotMessage: !!botMessage,
        isDBReady,
        hasUser: !!user
      });
      return;
    }
    
    console.log('[TOPIC DEBUG] Starting topic creation process for bot response');
    
    try {
      // CRITICAL FIX: Get current persona directly from context
      debugPersona("Current persona for topic creation", currentPersonaId);
      
      // Find the user message that preceded this bot message
      const allMessages = pendingMessagesRef.current;
      const messageIndex = allMessages.findIndex(msg => msg.id === botMessage.id);
      const precedingMessages = messageIndex > 0 ? allMessages.slice(0, messageIndex) : [];
      const lastUserMessage = [...precedingMessages].reverse().find(msg => !msg.isBot);
      
      if (!lastUserMessage) {
        console.log('[TOPIC DEBUG] No user message found before bot response, skipping topic creation');
        return;
      }
      
      console.log(`[TOPIC DEBUG] Found user message before bot response: "${lastUserMessage.text.substring(0, 30)}..."`);
      
      // Check if we already have a topic
      let topicId = currentTopicRef.current;
      
      // If no topic exists yet, create one
      if (!topicId) {
        console.log('[TOPIC DEBUG] No existing topic, creating new one');
        
        // EXTRACT TITLE from bot message
        const extractedTitle = extractTitleFromBotText(botMessage.text);
        console.log(`[TOPIC DEBUG] Extracted title: "${extractedTitle}"`);
        
        // Make sure DB is definitely open
        if (!db.isOpen()) {
          console.log('[TOPIC DEBUG] Forcibly opening database');
          await db.open();
        }
        
        // Create the topic
        try {
          console.log('[TOPIC DEBUG] Creating topic in database');
          const timestamp = Date.now();
          
          // First check if DB is accessible
          let isDBAccessible = false;
          try {
            const count = await db.topics.count();
            console.log(`[TOPIC DEBUG] Database check: ${count} existing topics`);
            isDBAccessible = true;
          } catch (dbCheckError) {
            console.error('[TOPIC DEBUG] Database check failed:', dbCheckError);
            // Try reopening
            try {
              await db.close();
              await db.open();
              isDBAccessible = true;
              console.log('[TOPIC DEBUG] Database reopened successfully');
            } catch (reopenError) {
              console.error('[TOPIC DEBUG] Database reopen failed:', reopenError);
            }
          }
          
          if (!isDBAccessible) {
            console.error('[TOPIC DEBUG] Database is not accessible, cannot create topic');
            return;
          }
          
          // Prepare topic data
          const topicData = {
            userId: user.email,
            title: extractedTitle,
            createdAt: timestamp,
            lastActive: timestamp,
            messageCnt: 2, // Both messages
            userMessageCnt: 1,
            assistantMessageCnt: 1,
            totalTokens: Math.ceil(lastUserMessage.text.length / 4) + Math.ceil(botMessage.text.length / 4),
            model: 'claude-3',
            systemPrompt: '',
            pinnedState: false,
            personaId: currentPersonaId // CRITICAL FIX: Use the current persona ID from context
          };
          
          // Try to add the topic with multiple approaches
          
          // Approach 1: Standard add
          console.log('[TOPIC DEBUG] Attempting to create topic - Approach 1: Standard add');
          topicId = await db.topics.add(topicData);
          console.log(`[TOPIC DEBUG] Topic created with ID: ${topicId} (Approach 1)`);
          
          // Verify topic exists
          const createdTopic = await db.topics.get(topicId);
          if (!createdTopic) {
            console.error(`[TOPIC DEBUG] Topic verification failed, ID: ${topicId}`);
            throw new Error('Topic verification failed');
          }
          
          console.log(`[TOPIC DEBUG] Topic verified: ${topicId}, title: "${createdTopic.title}"`);
          
          // Update state and ref
          setCurrentTopicId(topicId);
          currentTopicRef.current = topicId;
          
          // Now save the messages
          console.log('[TOPIC DEBUG] Saving messages to new topic');
          
          // User message first
          const userMessageData = {
            topicId,
            timestamp: lastUserMessage.timestamp || timestamp - 1000,
            role: 'user' as const,
            content: lastUserMessage.text,
            type: 'text',
            tokens: Math.ceil(lastUserMessage.text.length / 4)
          };
          
          console.log('[TOPIC DEBUG] Saving user message');
          const userMessageId = await db.safePutMessage(userMessageData);
          console.log(`[TOPIC DEBUG] User message saved with ID: ${userMessageId}`);
          
          // Bot message second
          const botMessageData = {
            topicId,
            timestamp: botMessage.timestamp || timestamp,
            role: 'assistant' as const,
            content: botMessage.text,
            type: 'text',
            tokens: Math.ceil(botMessage.text.length / 4),
            modelVersion: 'claude-3'
          };
          
          console.log('[TOPIC DEBUG] Saving bot message');
          const botMessageId = await db.safePutMessage(botMessageData);
          console.log(`[TOPIC DEBUG] Bot message saved with ID: ${botMessageId}`);
          
          console.log('[TOPIC DEBUG] Topic creation and message saving complete');
          
        } catch (error) {
          console.error('[TOPIC DEBUG] Error creating topic:', error);
          
          // Fallback approach if the first approach failed
          try {
            console.log('[TOPIC DEBUG] Attempting fallback approach for topic creation');
            
            // Create topic with direct transaction
            await db.transaction('rw', db.topics, async () => {
              const timestamp = Date.now();
              
              const fallbackTopicData = {
                id: Date.now() + 1000, // Force an ID
                userId: user.email,
                title: extractedTitle,
                createdAt: timestamp,
                lastActive: timestamp,
                messageCnt: 2,
                userMessageCnt: 1,
                assistantMessageCnt: 1,
                totalTokens: Math.ceil(lastUserMessage.text.length / 4) + Math.ceil(botMessage.text.length / 4),
                model: 'claude-3',
                systemPrompt: '',
                pinnedState: false,
                personaId: currentPersonaId // CRITICAL FIX: Use the current persona ID from context
              };
              
              topicId = await db.topics.put(fallbackTopicData);
              console.log(`[TOPIC DEBUG] Fallback topic created with ID: ${topicId}`);
              
              // Update state and ref
              setCurrentTopicId(topicId);
              currentTopicRef.current = topicId;
              
              // User message
              await db.messages.put({
                id: Date.now() + 2000,
                topicId,
                timestamp: lastUserMessage.timestamp || timestamp - 1000,
                role: 'user',
                content: lastUserMessage.text,
                type: 'text',
                tokens: Math.ceil(lastUserMessage.text.length / 4)
              });
              
              // Bot message
              await db.messages.put({
                id: Date.now() + 3000,
                topicId,
                timestamp: botMessage.timestamp || timestamp,
                role: 'assistant',
                content: botMessage.text,
                type: 'text',
                tokens: Math.ceil(botMessage.text.length / 4),
                modelVersion: 'claude-3'
              });
            });
            
            console.log('[TOPIC DEBUG] Fallback approach completed successfully');
          } catch (fallbackError) {
            console.error('[TOPIC DEBUG] Fallback approach also failed:', fallbackError);
          }
        }
      } else {
        // Topic already exists, just save the bot message
        console.log(`[TOPIC DEBUG] Using existing topic ${topicId}`);
        
        try {
          // Verify topic exists
          const topic = await db.topics.get(topicId);
          if (!topic) {
            console.error(`[TOPIC DEBUG] Existing topic ${topicId} not found, cannot save message`);
            return;
          }
          
          // CRITICAL FIX: If the topic doesn't have a persona, save the current one
          if (!topic.personaId) {
            console.log(`[TOPIC DEBUG] Topic has no persona, setting to current: ${currentPersonaId}`);
            await db.topics.update(topicId, { personaId: currentPersonaId });
          } else {
            console.log(`[TOPIC DEBUG] Topic already has persona: ${topic.personaId}`);
          }
          
          // Save bot message with put
          await db.messages.put({
            id: Date.now(),
            topicId,
            timestamp: botMessage.timestamp || Date.now(),
            role: 'assistant',
            content: botMessage.text,
            type: 'text',
            tokens: Math.ceil(botMessage.text.length / 4),
            modelVersion: 'claude-3'
          });
          
          // Update topic statistics
          await db.topics.update(topicId, {
            lastActive: Date.now(),
            messageCnt: (topic.messageCnt || 0) + 1,
            assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1,
            totalTokens: (topic.totalTokens || 0) + Math.ceil(botMessage.text.length / 4)
          });
          
          // If topic still has default title, extract a new one from the bot message
          if (topic.title === "New Conversation") {
            console.log(`[TOPIC DEBUG] Topic has default title, extracting new title from bot message`);
            const newTitle = extractTitleFromBotText(botMessage.text);
            
            // Update topic title
            await db.topics.update(topicId, { title: newTitle });
            console.log(`[TOPIC DEBUG] Updated topic title to: "${newTitle}"`);
          }
        } catch (error) {
          console.error('[TOPIC DEBUG] Error saving bot message to existing topic:', error);
        }
      }
    } catch (outerError) {
      console.error('[TOPIC DEBUG] Critical error in topic creation process:', outerError);
    }
  }, [isDBReady, user, currentPersonaId]); // Add currentPersonaId to dependency array

  // CRITICAL FIX: Add debug methods inside the component to have access to state
  const debugPersona = (message: string, personaId: string) => {
    debugLogger('PERSONA DEBUG', message, personaId);
  };

  // EMERGENCY FIX: Method to directly get the current persona ID from context
  const getCurrentPersonaId = () => {
    // Return the current persona directly from context state
    debugLogger('PERSONA DEBUG', "Getting current persona ID", currentPersonaId);
    return currentPersonaId;
  };

  // Expose debugging functions to the window object
  useEffect(() => {
    window.getCurrentPersonaId = getCurrentPersonaId;
    window.absoluteForcePersona = absoluteForcePersona;
    
    return () => {
      // Clean up when component unmounts
      delete window.getCurrentPersonaId;
      delete window.absoluteForcePersona;
    };
  }, [currentPersonaId, absoluteForcePersona]);

  // Add an effect to monitor persona changes
  useEffect(() => {
    console.log(`[PERSONA DEBUG] Persona state changed to: ${currentPersonaId}`);
    
    // Store the current persona in localStorage whenever it changes
    try {
      localStorage.setItem('selectedPersonaId', currentPersonaId);
    } catch (e) {
      console.error('[PERSONA DEBUG] Failed to save persona to localStorage:', e);
    }
  }, [currentPersonaId]);

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
              <TailwindPersonaSelector socket={socket} />
            </div>

            {/* Scrollable chat area - takes remaining height */}
            <div className="flex-1 overflow-y-auto my-[10px] pb-[80px] relative bg-white/50 rounded-lg">
              {/* Chat display */}
              <div id="yitam-chat-container" className="flex flex-col p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] chat-messages-container">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-[#3A2E22] opacity-60 text-[1.1rem]">
                    {user ? `Xin chào ${user.name}! ` : 'Xin chào! '}
                    {(AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0]).displayName} đang lắng nghe!
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
                          ? (AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0]).displayName
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
                  <div className="relative w-full max-w-5xl bg-white rounded-lg shadow-xl animate-fade-in h-[80vh] flex flex-col">
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
                    
                    <div className="flex-1 overflow-auto p-6">
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
                      <div className="p-5 border-t border-[#E6DFD1]">
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