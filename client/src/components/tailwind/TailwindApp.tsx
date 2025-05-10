import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../../config';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { TailwindAuth } from './TailwindAuth';
import TailwindChatBox from './TailwindChatBox';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindTermsModal from './TailwindTermsModal';
import TailwindPersonaSelector from './TailwindPersonaSelector';
import TailwindToolCallParser from './TailwindToolCallParser';
import { ConsentProvider } from '../../contexts/ConsentContext';
import { AVAILABLE_PERSONAS, Persona } from './TailwindPersonaSelector';
import * as ReactDOM from 'react-dom';

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
    type: 'rate_limit' | 'other';
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

// Add UserData interface
interface UserData {
  email: string;
  name: string;
  picture: string;
}

function TailwindApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
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
        'X-User-Name': userData.name
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

      newSocket.on('bot-response-end', (response: { id: string }) => {
        const currentMessages = pendingMessagesRef.current;
        const updatedMessages = currentMessages.map(msg => 
          msg.id.includes(`-${response.id}`)
            ? { ...msg, isStreaming: false }
            : msg
        );
        updateMessages(updatedMessages);
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
    let currentSocket: Socket | null = null;

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
      return;
    }
    
    lastMessageRef.current = text;
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const userMessage: Message = {
      id: `user-${timestamp}-${randomId}`,
      text,
      isBot: false
    };
    
    const currentMessages = pendingMessagesRef.current;
    updateMessages([...currentMessages, userMessage]);
    
    ReactDOM.unstable_batchedUpdates(() => {
      setHasUserSentMessage(true);
      setIsPersonaLocked(true);
    });
    
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
    socket.emit('chat-message', {
      message: text,
      personaId: selectedPersonaId,
      domains: selectedPersona.domains
    });
  }, [socket, selectedPersonaId, updateMessages]);

  // Memoize sorted messages
  const sortedMessages = useMemo(() => {
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

  // Debug logging outside render cycle
  useEffect(() => {
    console.log("Messages state updated:", messages.map(m => ({
      id: m.id,
      isBot: m.isBot,
      hasError: !!m.error,
      errorType: m.error?.type,
      isStreaming: m.isStreaming
    })));
  }, [messages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    const chatContainer = document.getElementById('yitam-chat-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);

  // Add user profile component in header
  const UserProfile = () => (
    user && (
      <div className="flex items-center space-x-2 ml-4">
        <img
          src={user.picture}
          alt={user.name}
          className="w-8 h-8 rounded-full border-2 border-[#78A161]"
        />
        <div className="hidden md:block">
          <p className="text-sm font-medium text-[#5D4A38]">{user.name}</p>
          <button
            onClick={handleLogout}
            className="text-xs text-[#BC4749] hover:text-[#9A383A]"
          >
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

  // Function to start a new chat
  const startNewChat = () => {
    // Find selected persona
    const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
    
    // Reset message state with just the welcome message
    updateMessages([
      {
        id: 'welcome',
        text: `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true
      }
    ]);
    
    // Also clear any manually added messages in the DOM
    setTimeout(() => {
      const chatContainer = document.getElementById('yitam-chat-container');
      if (chatContainer) {
        // Get all messages except for the welcome message
        const messagesToRemove = chatContainer.querySelectorAll('[data-message-id]:not([data-message-id="welcome"])');
        messagesToRemove.forEach(element => element.remove());
        
        // Check if welcome message exists in DOM, if not add it
        const welcomeMessage = chatContainer.querySelector('[data-message-id="welcome"]');
        if (!welcomeMessage) {
          chatContainer.innerHTML = `
            <div data-message-id="welcome" data-message-type="bot" class="mb-3 self-start max-w-[80%]" style="display: block;">
              <div class="p-[10px_14px] rounded-[8px] text-[0.95rem] leading-[1.5] bg-[#F2EEE5] text-[#3A2E22] rounded-[0_8px_8px_8px]">
                <div class="prose prose-sm max-w-none prose-headings:my-2 prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-ul:pl-6 prose-ol:my-2 prose-ol:pl-6 prose-li:my-1 prose-code:bg-[rgba(93,74,56,0.1)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-pre:bg-[rgba(93,74,56,0.1)] prose-pre:p-4 prose-pre:rounded-lg prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:code:bg-transparent prose-pre:code:p-0">
                  ${selectedPersona.displayName} đang lắng nghe!
                </div>
              </div>
              <div class="text-xs text-gray-500 ml-2 mt-1">${selectedPersona.displayName}</div>
            </div>
          `;
        }
      }
      
      // Reset lastMessageRef to prevent blocking new messages that might be identical to previous ones
      lastMessageRef.current = null;
      
      console.log('DOM messages cleared for new chat');
    }, 50);
    
    // Maintain hasUserSentMessage as true to keep the input visible
    // but allow persona selection
    setIsPersonaLocked(false);
    
    // Log that we've started a new chat
    console.log('Started new chat, messages reset');
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
            <header className="flex flex-col md:flex-row justify-between items-center border-b border-[#E6DFD1] mb-0.5 bg-[#F5EFE0] rounded px-2 shadow-[0_1px_1px_rgba(0,0,0,0.05)] overflow-hidden relative sticky top-0 z-10">
              <div className="flex-none flex items-center z-10 relative overflow-visible md:max-w-[35%] md:mr-1.5 pl-4 md:pl-8">
                <img 
                  src="/img/yitam-logo.png" 
                  alt="Yitam Logo" 
                  className="h-auto w-[160px] md:w-[280px] max-w-none md:-my-[15px] md:scale-[1.15] md:origin-center relative"
                />
              </div>
              <div className="flex-1 md:py-1 md:pl-[60px] z-[3] relative md:ml-auto md:w-[65%] text-center md:text-left py-0.5 flex justify-between items-center">
                <div>
                  <h1 className="text-[1.3rem] md:text-[1.8rem] text-[#5D4A38] font-semibold m-0 mb-0 leading-[1.1] md:leading-[1.1]">
                    Hỏi đáp về y học cổ truyền
                  </h1>
                  <p className="text-[0.75rem] md:text-[0.9rem] text-[#5D4A38] opacity-80 m-0 leading-tight">
                    Kết nối tri thức y học cổ truyền với công nghệ hiện đại
                  </p>
                </div>
                <UserProfile />
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
                    Xin chào! {(AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0]).displayName} đang lắng nghe!
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
                            <TailwindToolCallParser text={message.text} />
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
              
              {/* Show sample questions only when we have just the welcome message */}
              {messages.length === 1 && messages[0].id === 'welcome' && !hasUserSentMessage && (
                <TailwindSampleQuestions 
                  onQuestionClick={sendMessage} 
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
              <TailwindMessageInput onSendMessage={sendMessage} disabled={!isConnected} />
              
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
        </div>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 