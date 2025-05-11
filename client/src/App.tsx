import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from './config';
import ChatBox from './components/ChatBox';
import MessageInput from './components/MessageInput';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { TailwindAuth } from './components/tailwind/TailwindAuth';
import { TailwindApiKeySettings } from './components/tailwind/TailwindApiKeySettings';
import './App.css';
import { ApiKeyProvider, useApiKey } from './contexts/ApiKeyContext';

// Message interface
interface Message {
  id: string;
  text: string;
  isBot: boolean;
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
  const { hasApiKey, getApiKey } = useApiKey();

  useEffect(() => {
    // Check for existing user session
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

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
          
          setMessages([{
            id: 'welcome',
            text: 'Xin chào! Yitam đang lắng nghe!',
            isBot: true
          }]);
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
          setMessages(prev => 
            prev.map(msg => 
              msg.id === response.id 
                ? { ...msg, isStreaming: false }
                : msg
            )
          );
        });

        currentSocket.on('error', (error: { type: string, message: string }) => {
          console.error('Server error:', error);
          const errorMessage = {
            id: Date.now().toString(),
            text: error.message,
            isBot: true,
            isError: true
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

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isBot: false
    };

    setMessages(prev => [...prev, userMessage]);
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

            <div className="beta-notification mb-4">
              ⚠️ Đây là phiên bản beta của chatbot. Các tính năng và phản hồi có thể bị giới hạn hoặc đang trong giai đoạn thử nghiệm.
            </div>
            
            <main className="chat-container">
              <ChatBox messages={messages} />
              <MessageInput onSendMessage={sendMessage} disabled={!isConnected} />
            </main>
            
            <footer className="app-footer">
              <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                {isConnected ? 'Sẵn sàng' : 'Ngoại tuyến'}
              </div>
              <a href="https://github.com/sponsors/hadv" target="_blank" rel="noopener noreferrer" className="sponsor-link">
                <span className="sponsor-icon">♥</span>
                <span className="sponsor-text">Hỗ trợ dự án</span>
              </a>
              <div className="copyright">
                © {new Date().getFullYear()} Yitam. All rights reserved.
              </div>
            </footer>
          </div>
        )}
      </div>
    </ApiKeyProvider>
  );
}

export default App; 