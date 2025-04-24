import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../../config';
import TailwindChatBox from './TailwindChatBox';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindTermsModal from './TailwindTermsModal';
import { ConsentProvider } from '../../contexts/ConsentContext';

// Message interface
interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
}

function TailwindApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [questionsLimit] = useState(6); // Default sample questions limit
  const inputRef = useRef<HTMLDivElement>(null);

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
        { 
          id: `bot-${response.id}`, 
          text: '', 
          isBot: true, 
          isStreaming: true 
        }
      ]);
    });

    // Handle streaming chunks
    newSocket.on('bot-response-chunk', (response: { text: string, id: string }) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === `bot-${response.id}` 
            ? { ...msg, text: msg.text + response.text }
            : msg
        )
      );
    });

    // Handle end of streaming response
    newSocket.on('bot-response-end', (response: { id: string }) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === `bot-${response.id}` 
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
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
      id: `user-${Date.now().toString()}`,
      text,
      isBot: false
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Mark that user has sent a message
    if (!hasUserSentMessage) {
      setHasUserSentMessage(true);
    }
    
    // Send message to server
    socket.emit('chat-message', text);
  };

  return (
    <ConsentProvider>
      <>
        <TailwindTermsModal socket={socket} />
        <div className="h-screen bg-[#FDFBF6] text-[#3A2E22] flex justify-center overflow-hidden">
          {/* Main content - container with max width and fixed height layout */}
          <div className="w-full max-w-[1000px] flex flex-col h-screen p-2 overflow-hidden">
            {/* Header - sticky at top */}
            <header className="flex flex-col md:flex-row justify-between items-center border-b border-[#E6DFD1] mb-0.5 bg-[#F5EFE0] rounded px-2 shadow-[0_1px_1px_rgba(0,0,0,0.05)] overflow-hidden relative sticky top-0 z-10">
              {/* Logo container with exact styling from original */}
              <div className="flex-none flex items-center z-10 relative overflow-visible md:max-w-[35%] md:mr-1.5 pl-4 md:pl-8">
                <img 
                  src="/img/yitam-logo.png" 
                  alt="Yitam Logo" 
                  className="h-auto w-[160px] md:w-[280px] max-w-none md:-my-[15px] md:scale-[1.15] md:origin-center relative"
                />
              </div>
              
              {/* Text container with exact styling from original */}
              <div className="flex-1 md:py-1 md:pl-[60px] z-[3] relative md:ml-auto md:w-[65%] text-center md:text-left py-0.5">
                <h1 className="text-[1.3rem] md:text-[1.8rem] text-[#5D4A38] font-semibold m-0 mb-0 leading-[1.1] md:leading-[1.1]">
                  Hỏi đáp về y học cổ truyền
                </h1>
                <p className="text-[0.75rem] md:text-[0.9rem] text-[#5D4A38] opacity-80 m-0 leading-tight">
                  Kết nối tri thức y học cổ truyền với công nghệ hiện đại
                </p>
              </div>
            </header>

            {/* Scrollable chat area - takes remaining height */}
            <div className={`flex-1 overflow-y-auto my-[10px] ${hasUserSentMessage ? 'pb-[80px]' : ''}`}>
              <TailwindChatBox messages={messages} />
              {messages.length <= 1 && (
                <>
                  <TailwindSampleQuestions 
                    onQuestionClick={sendMessage} 
                    socket={socket} 
                    limit={questionsLimit}
                  />
                  {/* Only show the input inline when user hasn't sent a message and sample questions are visible */}
                  {!hasUserSentMessage && (
                    <div className="mt-4 w-full transition-all duration-300 ease-in-out">
                      <TailwindMessageInput onSendMessage={sendMessage} disabled={!isConnected} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Message input - fixed at bottom after user sends message */}
            {hasUserSentMessage && (
              <div 
                ref={inputRef} 
                className="sticky bottom-0 bg-[#FDFBF6] pt-2 z-10 w-full transition-all duration-300 ease-in-out"
              >
                <TailwindMessageInput onSendMessage={sendMessage} disabled={!isConnected} />
                
                {/* Footer */}
                <footer className="bg-[#F5EFE0] mt-2 py-[5px] px-[5px] flex justify-between items-center border-t border-[#E6DFD1] rounded shadow-[0_-1px_1px_rgba(0,0,0,0.05)] min-h-[30px]">
                  <div className={`text-[0.65rem] font-medium px-1 py-[1px] rounded ${
                    isConnected 
                      ? 'bg-[rgba(120,161,97,0.2)] text-[#78A161]' 
                      : 'bg-[rgba(188,71,73,0.2)] text-[#BC4749]'
                  }`}>
                    {isConnected ? 'Sẵn sàng' : 'Ngoại tuyến'}
                  </div>
                  <a 
                    href="https://github.com/sponsors/hadv" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center text-[0.6rem] font-medium text-[#78A161] bg-[rgba(120,161,97,0.1)] hover:bg-[rgba(120,161,97,0.2)] px-[3px] py-[1px] rounded transition-all hover:scale-105"
                  >
                    <span className="text-[#BC4749] mr-1 text-[0.65rem]">♥</span>
                    <span className="leading-none">Hỗ trợ dự án</span>
                  </a>
                </footer>
              </div>
            )}

            {/* Footer shown at the bottom initially */}
            {!hasUserSentMessage && (
              <footer className="bg-[#F5EFE0] mt-2 py-[5px] px-[5px] flex justify-between items-center border-t border-[#E6DFD1] rounded shadow-[0_-1px_1px_rgba(0,0,0,0.05)] min-h-[30px]">
                <div className={`text-[0.65rem] font-medium px-1 py-[1px] rounded ${
                  isConnected 
                    ? 'bg-[rgba(120,161,97,0.2)] text-[#78A161]' 
                    : 'bg-[rgba(188,71,73,0.2)] text-[#BC4749]'
                }`}>
                  {isConnected ? 'Sẵn sàng' : 'Ngoại tuyến'}
                </div>
                <a 
                  href="https://github.com/sponsors/hadv" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center text-[0.6rem] font-medium text-[#78A161] bg-[rgba(120,161,97,0.1)] hover:bg-[rgba(120,161,97,0.2)] px-[3px] py-[1px] rounded transition-all hover:scale-105"
                >
                  <span className="text-[#BC4749] mr-1 text-[0.65rem]">♥</span>
                  <span className="leading-none">Hỗ trợ dự án</span>
                </a>
              </footer>
            )}
          </div>
        </div>
      </>
    </ConsentProvider>
  );
}

export default TailwindApp; 