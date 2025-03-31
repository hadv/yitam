import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
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
    const newSocket = io('http://localhost:5001', {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
      
      // Add welcome message
      setMessages([
        {
          id: 'welcome',
          text: 'Hello! I\'m Claude, an AI assistant. How can I help you today?',
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
        <h1>Claude Chat Bot</h1>
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
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