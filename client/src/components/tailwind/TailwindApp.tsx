import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../../config';
import TailwindChatBox from './TailwindChatBox';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindTermsModal from './TailwindTermsModal';
import TailwindAccessCodeInput from './TailwindAccessCodeInput';
import { ConsentProvider } from '../../contexts/ConsentContext';
import { generateRequestSignature } from '../../utils/security';

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
  const [hasAccess, setHasAccess] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [questionsLimit] = useState(6); // Default sample questions limit
  const inputRef = useRef<HTMLDivElement>(null);
  const [pendingAccessCode, setPendingAccessCode] = useState<string | null>(null);
  
  useEffect(() => {
    if (!pendingAccessCode) return;

    // Generate request signature and establish connection
    const connectWithSignature = async () => {
      try {
        // Show loading state
        setAccessError('Đang xác thực mã truy cập...');
        
        // Generate a signature for the access code
        const { signature, timestamp } = await generateRequestSignature(pendingAccessCode);
        
        // Initialize socket connection
        const newSocket = io(config.server.url, {
          ...config.server.socketOptions,
          extraHeaders: {
            'X-Access-Code': pendingAccessCode,
            'X-Request-Signature': signature,
            'X-Request-Timestamp': timestamp.toString()
          }
        });
        
        // Prepare a variable for connection timeout
        let connectionTimeout: ReturnType<typeof setTimeout>;

        newSocket.on('connect', () => {
          clearTimeout(connectionTimeout);
          setIsConnected(true);
          setHasAccess(true);
          setAccessError('');
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
          clearTimeout(connectionTimeout);
          console.error('Connection error:', error.message);
          
          // Provide more specific error messages based on the error
          if (error.message.includes('Access code is required')) {
            setAccessError('Vui lòng nhập mã truy cập để tiếp tục.');
          } else if (error.message.includes('Invalid access code')) {
            setAccessError('Mã truy cập không hợp lệ. Vui lòng kiểm tra và thử lại.');
          } else if (error.message.includes('signature')) {
            setAccessError('Lỗi xác thực chữ ký. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.');
          } else {
            setAccessError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
          }
          
          setHasAccess(false);
          setPendingAccessCode(null);
          localStorage.removeItem('accessCode');
          
          // Close the socket on error
          newSocket.close();
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

        // Add a connection timeout
        connectionTimeout = setTimeout(() => {
          if (!newSocket.connected) {
            setAccessError('Kết nối tới máy chủ quá thời gian. Vui lòng thử lại sau.');
            setPendingAccessCode(null);
            newSocket.close();
          }
        }, 10000); // 10 second timeout

        setSocket(newSocket);

        return () => {
          clearTimeout(connectionTimeout);
          if (newSocket) {
            newSocket.close();
          }
        };
      } catch (error) {
        console.error('Error generating signature:', error);
        setAccessError('Lỗi xác thực. Vui lòng thử lại sau.');
        setPendingAccessCode(null);
        return () => {};
      }
    };

    connectWithSignature();
  }, [pendingAccessCode]);

  const handleAccessGranted = (accessCode: string) => {
    setPendingAccessCode(accessCode);
    localStorage.setItem('accessCode', accessCode);
  };

  if (!hasAccess) {
    return <TailwindAccessCodeInput onAccessGranted={handleAccessGranted} error={accessError} />;
  }

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

  // Function to start a new chat
  const startNewChat = () => {
    setMessages([
      {
        id: 'welcome',
        text: 'Xin chào! Yitam đang lắng nghe!',
        isBot: true
      }
    ]);
    setHasUserSentMessage(false);
  };

  // Check if any bot message is currently streaming
  const isBotResponding = messages.some(msg => msg.isBot && msg.isStreaming);

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

            {/* Beta warning banner */}
            <div className="bg-yellow-50 text-yellow-800 p-3 text-center text-sm rounded-md my-4 mx-2 border border-yellow-200">
              ⚠️ Đây là phiên bản beta của chatbot. Các tính năng và phản hồi có thể bị giới hạn hoặc đang trong giai đoạn thử nghiệm.
            </div>

            {/* Scrollable chat area - takes remaining height */}
            <div className={`flex-1 overflow-y-auto my-[10px] ${hasUserSentMessage ? 'pb-[80px]' : ''} relative`}>
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
            )}

            {/* Footer shown at the bottom initially */}
            {!hasUserSentMessage && (
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
                    {/* Invisible placeholder to maintain consistent footer size */}
                    <div className="ml-3 py-1.5 px-3 invisible">Placeholder</div>
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
            )}
          </div>
        </div>
      </>
    </ConsentProvider>
  );
}

export default TailwindApp; 