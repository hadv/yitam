import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from './config';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { TailwindAuth } from './components/tailwind/TailwindAuth';
import { TailwindApiKeySettings } from './components/tailwind/TailwindApiKeySettings';
import TailwindChatBox from './components/tailwind/TailwindChatBox';
import TailwindMessageInput from './components/tailwind/TailwindMessageInput';
import TailwindTopicSwitcher from './components/tailwind/TailwindTopicSwitcher';
import TailwindTopicManager from './components/tailwind/TailwindTopicManager';
import TailwindMessagePersistence, { useMessagePersistence } from './components/tailwind/TailwindMessagePersistence';
import { useChatHistory } from './contexts/ChatHistoryContext';
import db from './db/ChatHistoryDB';
import './App.css';
import { ApiKeyProvider, useApiKey } from './contexts/ApiKeyContext';

// Message interface
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

interface UserData {
  email: string;
  name: string;
  picture: string;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [currentTopicId, setCurrentTopicId] = useState<number | undefined>(undefined);
  const { hasApiKey, getApiKey } = useApiKey();
  const { isDBReady, dbError, storageUsage } = useChatHistory();
  const { saveMessage } = useMessagePersistence();
  const currentTopicRef = useRef<number | undefined>(undefined);

  // Update ref when state changes
  useEffect(() => {
    currentTopicRef.current = currentTopicId;
  }, [currentTopicId]);

  useEffect(() => {
    // Check for existing user session
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Load most recent topic or create new one
  useEffect(() => {
    const loadInitialTopic = async () => {
      if (!user || !isDBReady) return;
      
      try {
        // Get most recent topic for this user
        const topics = await db.topics
          .where('userId')
          .equals(user.email)
          .sortBy('lastActive');
        
        if (topics && topics.length > 0) {
          // Use the most recent topic
          const mostRecentTopic = topics[topics.length - 1];
          setCurrentTopicId(mostRecentTopic.id);
          
          // Load messages for this topic
          if (mostRecentTopic.id !== undefined) {
            const topicMessages = await db.messages
              .where('topicId')
              .equals(mostRecentTopic.id)
              .sortBy('timestamp');
              
            // Convert from DB format to UI format
            const uiMessages = topicMessages.map(dbMsg => ({
              id: `msg-${dbMsg.id}`,
              text: dbMsg.content,
              isBot: dbMsg.role === 'assistant',
              timestamp: dbMsg.timestamp
            }));
            
            setMessages(uiMessages);
          }
        } else {
          // Create a new topic if none exists
          await createNewTopic("New Conversation");
        }
      } catch (error) {
        console.error('Error loading initial topic:', error);
      }
    };
    
    loadInitialTopic();
  }, [user, isDBReady]);

  const createNewTopic = async (title: string) => {
    if (!user || !isDBReady) return;
    
    try {
      // Create a new topic
      const topicId = await db.topics.add({
        userId: user.email,
        title: title,
        createdAt: Date.now(),
        lastActive: Date.now(),
        messageCnt: 0,
        userMessageCnt: 0,
        assistantMessageCnt: 0,
        totalTokens: 0,
        model: 'claude-3'
      });
      
      // Set as current topic
      setCurrentTopicId(topicId);
      // Clear messages for new topic
      setMessages([{
        id: 'welcome',
        text: 'Xin chào! Yitam đang lắng nghe!',
        isBot: true
      }]);
      
      return topicId;
    } catch (error) {
      console.error('Error creating new topic:', error);
      return undefined;
    }
  };

  const handleTopicSelect = async (topicId: number) => {
    try {
      // Set current topic
      setCurrentTopicId(topicId);
      
      // Load messages for this topic
      const topicMessages = await db.messages
        .where('topicId')
        .equals(topicId)
        .sortBy('timestamp');
        
      // Convert from DB format to UI format
      const uiMessages = topicMessages.map(dbMsg => ({
        id: `msg-${dbMsg.id}`,
        text: dbMsg.content,
        isBot: dbMsg.role === 'assistant'
      }));
      
      // If there are no messages, add a welcome message
      if (uiMessages.length === 0) {
        uiMessages.push({
          id: 'welcome',
          text: 'Xin chào! Yitam đang lắng nghe!',
          isBot: true
        });
      }
      
      setMessages(uiMessages);
    } catch (error) {
      console.error('Error loading topic messages:', error);
    }
  };

  const handleLogout = useCallback(() => {
    // First, cleanup socket
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    // Clear all states in a single batch update
    setIsConnected(false);
    setMessages([]);
    setConnectionError('');
    
    // Remove from localStorage and clear user state last
    localStorage.removeItem('user');
    setUser(null);
  }, [socket]);

  useEffect(() => {
    let currentSocket: Socket | null = null;
    
    const setupSocket = async () => {
      if (!user) return;

      try {
        // Initialize socket connection with user credentials
        currentSocket = io(config.server.url, {
          ...config.server.socketOptions,
          extraHeaders: {
            'X-User-Email': user.email,
            'X-User-Name': user.name
          }
        });
        
        currentSocket.on('connect', () => {
          setIsConnected(true);
          console.log('Connected to server');
          
          // Only set welcome message if no messages loaded from DB
          if (messages.length === 0) {
            setMessages([{
              id: 'welcome',
              text: 'Xin chào! Yitam đang lắng nghe!',
              isBot: true
            }]);
          }
        });

        currentSocket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setConnectionError('Connection error. Please try again.');
        });

        currentSocket.on('disconnect', () => {
          setIsConnected(false);
          console.log('Disconnected from server');
        });

        // Handle streaming responses
        currentSocket.on('bot-response-start', (response: { id: string }) => {
          setMessages(prev => [
            ...prev,
            { id: response.id, text: '', isBot: true, isStreaming: true }
          ]);
        });

        currentSocket.on('bot-response-chunk', (response: { text: string, id: string }) => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === response.id 
                ? { ...msg, text: msg.text + response.text }
                : msg
            )
          );
        });

        currentSocket.on('bot-response-end', (response: { id: string }) => {
          setMessages(prev => {
            const updatedMessages = prev.map(msg => 
              msg.id === response.id 
                ? { ...msg, isStreaming: false }
                : msg
            );
            
            // Persist the completed message to database
            const botMessage = updatedMessages.find(msg => msg.id === response.id);
            if (botMessage && isDBReady && currentTopicRef.current) {
              // Save to database
              saveMessage(currentTopicRef.current, {
                timestamp: Date.now(),
                role: 'assistant',
                content: botMessage.text,
                tokens: estimateTokens(botMessage.text)
              });
            }
            
            return updatedMessages;
          });
        });

        currentSocket.on('error', (error: { type: string, message: string }) => {
          console.error('Server error:', error);
          const errorMessage = {
            id: Date.now().toString(),
            text: error.message,
            isBot: true,
            error: {
              type: error.type as any || 'other',
              message: error.message
            }
          };
          setMessages(prev => [...prev, errorMessage]);
        });

        setSocket(currentSocket);
      } catch (error) {
        console.error('Error setting up socket:', error);
        setConnectionError('Failed to connect to server');
      }
    };

    setupSocket();

    return () => {
      if (currentSocket) {
        currentSocket.disconnect();
      }
    };
  }, [user]);

  const handleAuthSuccess = (userData: UserData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    setConnectionError('');
  };

  // Simple token estimation function - approx 4 chars per token
  const estimateTokens = (text: string): number => {
    return Math.ceil(text.length / 4);
  };

  const sendMessage = async (text: string) => {
    if (!socket || !socket.connected) {
      console.error('Socket not connected');
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      console.error('API key not found');
      return;
    }

    // Create a new topic if none exists
    if (!currentTopicId && isDBReady) {
      const newTopicId = await createNewTopic("New Conversation");
      setCurrentTopicId(newTopicId);
    }

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      text,
      isBot: false
    };

    setMessages(prev => [...prev, userMessage]);
    
    // Persist user message to database
    if (isDBReady && currentTopicId) {
      saveMessage(currentTopicId, {
        timestamp: Date.now(),
        role: 'user',
        content: text,
        tokens: estimateTokens(text)
      });
    }
    
    socket.emit('chat-message', {
      message: text,
      apiKey
    });
  };

  if (!user) {
    return (
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <TailwindAuth onAuthSuccess={handleAuthSuccess} />
      </GoogleOAuthProvider>
    );
  }

  return (
    <ApiKeyProvider>
      <TailwindMessagePersistence>
        <div className="min-h-screen bg-gray-100">
          {!hasApiKey ? (
            <div className="container mx-auto px-4 py-8">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-4">Chào mừng đến với Yitam</h1>
                <p className="text-lg text-gray-600">Vui lòng cung cấp API key của Anthropic để tiếp tục</p>
              </div>
              <TailwindApiKeySettings onApiKeySet={() => {
                window.location.reload();
              }} />
            </div>
          ) : (
            <div className="app">
              <header className="app-header">
                <div className="logo-container">
                  <img src="/img/yitam-logo.png" alt="Yitam Logo" className="app-logo" />
                </div>
                <div className="header-content">
                  <h1>Hỏi đáp về y học cổ truyền</h1>
                  <p className="app-tagline">Kết nối tri thức y học cổ truyền với công nghệ hiện đại</p>
                </div>
                <div className="user-profile flex items-center">
                  <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
                  <span className="ml-2">{user.name}</span>
                  
                  {/* New topic management buttons */}
                  <div className="flex items-center ml-4">
                    <button
                      onClick={() => createNewTopic("New Conversation")}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center mr-2"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      New Chat
                    </button>
                    
                    <button
                      onClick={() => setShowTopicManager(true)}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                      Manage Topics
                    </button>
                  </div>
                  
                  <button
                    onClick={() => setShowApiSettings(true)}
                    className="ml-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    API Settings
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="ml-4 px-4 py-2 text-sm text-red-600 hover:text-red-800"
                  >
                    Đăng xuất
                  </button>
                </div>
              </header>

              {/* Chat area with storage status */}
              <div className="chat-area">
                {dbError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                    <p className="font-medium">Storage Error</p>
                    <p className="text-sm">{dbError instanceof Error ? dbError.message : dbError}</p>
                  </div>
                )}
                
                {storageUsage && storageUsage.percentage > 80 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded mb-4">
                    <p className="font-medium">Storage Warning</p>
                    <p className="text-sm">
                      Your chat history storage is {storageUsage.percentage.toFixed(1)}% full.
                      Consider deleting old conversations to free up space.
                    </p>
                  </div>
                )}
                
                <TailwindChatBox messages={messages} />
                <TailwindMessageInput onSendMessage={sendMessage} disabled={!isConnected} />
              </div>

              {/* Topic Manager Modal */}
              {showTopicManager && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-auto">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-semibold text-[#3A2E22]">Manage Chat History</h2>
                      <button
                        onClick={() => setShowTopicManager(false)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    <TailwindTopicManager
                      userId={user.email}
                      currentTopicId={currentTopicId}
                      onSelectTopic={(topicId: number) => {
                        handleTopicSelect(topicId);
                        setShowTopicManager(false);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* API Settings Modal */}
              {showApiSettings && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-xl">
                    <button
                      onClick={() => setShowApiSettings(false)}
                      className="absolute -top-12 right-0 text-white hover:text-gray-300"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <TailwindApiKeySettings onApiKeySet={() => {
                      setShowApiSettings(false);
                      window.location.reload();
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </TailwindMessagePersistence>
    </ApiKeyProvider>
  );
}

export default App; 