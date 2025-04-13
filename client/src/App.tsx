import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from './config';
import ChatBox from './components/ChatBox';
import MessageInput from './components/MessageInput';
import './App.css';

// Message interface
interface Message {
  id: string;
  text: string;
  isBot: boolean;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(config.server.url, config.server.socketOptions);
    
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

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('bot-response', (response: { text: string, id: string }) => {
      setMessages(prev => [
        ...prev,
        { id: response.id, text: response.text, isBot: true }
      ]);
    });

    setSocket(newSocket);

    // Cleanup on component unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

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
        <h1>Yitam - Hỏi đáp về y học cổ truyền</h1>
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Sẵn sàng' : 'Ngoại tuyến'}
        </div>
      </header>
      
      <main className="chat-container">
        <ChatBox messages={messages} />
        <MessageInput onSendMessage={sendMessage} disabled={!isConnected} />
      </main>
    </div>
  );
}

export default App; 