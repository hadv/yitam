import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from './config';
import ChatBox from './components/ChatBox';
import MessageInput from './components/MessageInput';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { TailwindAuth } from './components/tailwind/TailwindAuth';
import './App.css';

// Message interface
interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
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

  const sendMessage = (text: string) => {
    if (text.trim() === '' || !socket) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isBot: false
    };
    
    setMessages(prev => [...prev, userMessage]);
    socket.emit('chat-message', text);
  };

  if (!user) {
    return (
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <TailwindAuth onAuthSuccess={handleAuthSuccess} />
      </GoogleOAuthProvider>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo-container">
          <img src="/img/yitam-logo.png" alt="Yitam Logo" className="app-logo" />
        </div>
        <div className="header-content">
          <h1>Hỏi đáp về y học cổ truyền</h1>
          <p className="app-tagline">Kết nối tri thức y học cổ truyền với công nghệ hiện đại</p>
        </div>
        <div className="user-profile">
          <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
          <span className="ml-2">{user.name}</span>
          <button 
            onClick={handleLogout}
            className="ml-4 px-4 py-2 text-sm text-red-600 hover:text-red-800"
          >
            Đăng xuất
          </button>
        </div>
      </header>
      
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
  );
}

export default App; 