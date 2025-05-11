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
import { ConsentProvider } from '../../contexts/ConsentContext';
import { AVAILABLE_PERSONAS, Persona } from './TailwindPersonaSelector';
import * as ReactDOM from 'react-dom';
import { decryptApiKey } from '../../utils/encryption';
import { DefaultEventsMap } from '@socket.io/component-emitter';

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

function TailwindApp() {
  const [socket, setSocket] = useState<Socket<DefaultEventsMap, DefaultEventsMap> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [questionsLimit] = useState(6);
  const [selectedPersonaId, setSelectedPersonaId] = useState('yitam');
  const [isPersonaLocked, setIsPersonaLocked] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<string | null>(null);
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Use a stable reference for pending messages
  const pendingMessagesRef = useRef<Message[]>([]);
  const messageUpdaterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);

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

  // Socket connection handler
  const connectSocket = useCallback((userData: UserData) => {
    if (!userData) return null;

    const newSocket = io(config.server.url, {
      ...config.server.socketOptions,
      extraHeaders: {
        'X-User-Email': userData.email,
        'X-User-Name': userData.name,
        'X-Api-Key': decryptApiKey() || ''
      }
    });

    const setupSocketListeners = () => {
      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('Connected to server');
      });

      newSocket.on('bot-response-start', (response: { id: string }) => {
        const botTimestamp = Date.now() + 100;
        const botId = `bot-${botTimestamp}-${response.id}`;
        const currentMessages = pendingMessagesRef.current;
        
        updateMessages([
          ...currentMessages,
          { 
            id: botId, 
            text: '', 
            isBot: true, 
            isStreaming: true 
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
        const currentMessages = pendingMessagesRef.current;
        const updatedMessages = currentMessages.map(msg => {
          if (msg.id.includes(`-${response.id}`)) {
            if (response.error && response.errorMessage) {
              // Try to parse error message if it's JSON
              try {
                const parsedError = JSON.parse(response.errorMessage);
                return {
                  ...msg,
                  isStreaming: false,
                  error: {
                    type: parsedError.type as 'rate_limit' | 'credit_balance' | 'other',
                    message: parsedError.message
                  }
                };
              } catch (e) {
                // If not JSON, handle as before
                const isCreditBalanceError = response.errorMessage.toLowerCase().includes('credit balance');
                return {
                  ...msg,
                  isStreaming: false,
                  error: {
                    type: isCreditBalanceError ? 'credit_balance' as const : 'other' as const,
                    message: isCreditBalanceError
                      ? 'Số dư tín dụng API Anthropic của bạn quá thấp. Vui lòng truy cập Kế hoạch & Thanh toán để nâng cấp hoặc mua thêm tín dụng.'
                      : response.errorMessage
                  }
                };
              }
            }
            return { ...msg, isStreaming: false };
          }
          return msg;
        });
        updateMessages(updatedMessages);
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

    setupSocketListeners();
    return newSocket;
  }, [updateMessages]);

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

  // Message sender
  const sendMessage = useCallback((text: string) => {
    if (text.trim() === '' || !socket) return;
    
    if (lastMessageRef.current === text) {
      console.log('Duplicate message prevented:', text);
      return;
    }
    
    console.log('Sending message:', text);
    
    lastMessageRef.current = text;
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const userMessage: Message = {
      id: `user-${timestamp}-${randomId}`,
      text,
      isBot: false
    };
    
    // Update messages immediately
    setMessages(prevMessages => [...prevMessages, userMessage]);
    pendingMessagesRef.current = [...pendingMessagesRef.current, userMessage];
    
    // Update UI state
    setHasUserSentMessage(true);
    setIsPersonaLocked(true);
    
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
    socket.emit('chat-message', {
      message: text,
      personaId: selectedPersonaId,
      domains: selectedPersona.domains
    });
    
    console.log('Message sent, current messages:', pendingMessagesRef.current.length);
  }, [socket, selectedPersonaId, setMessages]);

  // Function to start a new chat
  const startNewChat = useCallback(() => {
    console.log('Starting new chat...');
    
    // Find selected persona
    const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
    
    // Create welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      text: user 
        ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`
        : `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
      isBot: true
    };

    // Reset all states
    lastMessageRef.current = null;
    pendingMessagesRef.current = [welcomeMessage];
    
    // Update UI state
    setMessages([welcomeMessage]);
    setHasUserSentMessage(false);
    setIsPersonaLocked(false);
    
    console.log('New chat started, states reset');
  }, [selectedPersonaId, user]);

  // Initialize messages when component mounts or user changes
  useEffect(() => {
    if (messages.length === 0 && user) {
      console.log('Initializing welcome message...');
      startNewChat();
    }
  }, [messages.length, user, startNewChat]);

  // Memoize sorted messages
  const sortedMessages = useMemo(() => {
    console.log('Sorting messages, count:', messages.length);
    return [...messages].sort((a, b) => {
      // Welcome message always first
      if (a.id === 'welcome') return -1;
      if (b.id === 'welcome') return 1;
      
      // Extract timestamps from IDs
      const getTimestamp = (id: string) => {
        const match = id.match(/-(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
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
        <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-white rounded-lg shadow-lg border border-[#E6DFD1] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
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
                    window.location.reload();
                  }} 
                />
              </div>
            </div>
          )}
        </div>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 