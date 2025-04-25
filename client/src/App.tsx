import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from './config';
import ChatBox from './components/ChatBox';
import MessageInput from './components/MessageInput';
import AccessCodeInput from './components/AccessCodeInput';
import './App.css';

// Message interface
interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    if (!hasAccess) return;

    // Initialize socket connection
    const newSocket = io(config.server.url, {
      ...config.server.socketOptions,
      extraHeaders: {
        'X-Access-Code': localStorage.getItem('accessCode') || ''
      }
    });
    
    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
      
      // Add welcome message
      setMessages([
        {
          id: 'welcome',
          text: 'Xin chào! Yitam đang lắng nghe!',
          isBot: true
        }
      ]);
    });

    newSocket.on('connect_error', (error) => {
      if (error.message.includes('Invalid access code')) {
        setAccessError('Invalid access code. Please try again.');
        setHasAccess(false);
        localStorage.removeItem('accessCode');
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    // Handle old-style responses (for backward compatibility)
    newSocket.on('bot-response', (response: { text: string, id: string }) => {
      setMessages(prev => [
        ...prev,
        { id: response.id, text: response.text, isBot: true }
      ]);
    });

    // Handle the start of a streaming response
    newSocket.on('bot-response-start', (response: { id: string }) => {
      setMessages(prev => [
        ...prev,
        { id: response.id, text: '', isBot: true, isStreaming: true }
      ]);
    });

    // Handle streaming chunks
    newSocket.on('bot-response-chunk', (response: { text: string, id: string }) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === response.id 
            ? { ...msg, text: msg.text + response.text }
            : msg
        )
      );
    });

    // Handle end of streaming response
    newSocket.on('bot-response-end', (response: { id: string }) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === response.id 
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [hasAccess]);

  const handleAccessGranted = (accessCode: string) => {
    localStorage.setItem('accessCode', accessCode);
    setHasAccess(true);
  };

  if (!hasAccess) {
    return <AccessCodeInput onAccessGranted={handleAccessGranted} />;
  }

  const sendMessage = (text: string) => {
    if (text.trim() === '' || !socket) return;
    
    // Add user message to state
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isBot: false
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Send message to server
    socket.emit('chat-message', text);
  };

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
      </header>
      
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
      </footer>
    </div>
  );
}

export default App; 