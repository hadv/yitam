import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../../config';
import TailwindChatBox from './TailwindChatBox';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindTermsModal from './TailwindTermsModal';
import TailwindAccessCodeInput from './TailwindAccessCodeInput';
import TailwindPersonaSelector from './TailwindPersonaSelector';
import TailwindToolCallParser from './TailwindToolCallParser';
import { ConsentProvider } from '../../contexts/ConsentContext';
import { generateRequestSignature } from '../../utils/security';

// Import persona constant from the selector component
import { AVAILABLE_PERSONAS, Persona } from './TailwindPersonaSelector';

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

function TailwindApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [questionsLimit] = useState(6); // Default sample questions limit
  const [selectedPersonaId, setSelectedPersonaId] = useState('yitam'); // Default to Yitam
  const [isPersonaLocked, setIsPersonaLocked] = useState(false); // Add state for persona locking
  const inputRef = useRef<HTMLDivElement>(null);
  const [pendingAccessCode, setPendingAccessCode] = useState<string | null>(null);
  const lastMessageRef = useRef<string | null>(null); // Track last message to prevent duplicates
  
  // Debug log for messages state
  useEffect(() => {
    console.log("Messages state updated:", messages.map(m => ({
      id: m.id,
      isBot: m.isBot,
      hasError: !!m.error,
      errorType: m.error?.type,
      isStreaming: m.isStreaming
    })));
  }, [messages]);

  // Effect to update welcome message when persona changes (if it's the only message)
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'welcome' && !hasUserSentMessage) {
      const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
      setMessages([
        {
          id: 'welcome',
          text: `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
          isBot: true
        }
      ]);
    }
  }, [selectedPersonaId, messages, hasUserSentMessage]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    const chatContainer = document.getElementById('yitam-chat-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);
  
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
          
          // Get the default persona
          const defaultPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
          
          // Add welcome message with the default persona's name
          setMessages([
            {
              id: 'welcome',
              text: `Xin chào! ${defaultPersona.displayName} đang lắng nghe!`,
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
          console.log('Received bot-response:', response);
          
          // Create a timestamp-based bot ID for proper ordering
          const botTimestamp = Date.now() + 100; // Slightly later than user message
          const botId = `bot-${botTimestamp}-${response.id}`;
          
          setMessages(prev => {
            const newMessages = [
              ...prev,
              { id: botId, text: response.text, isBot: true }
            ];
            console.log("Messages after adding bot response:", newMessages.length);
            return newMessages;
          });
        });

        // Handle the start of a streaming response
        newSocket.on('bot-response-start', (response: { id: string }) => {
          // Create a timestamp-based bot ID for proper ordering
          const botTimestamp = Date.now() + 100; // Slightly later than user message
          const botId = `bot-${botTimestamp}-${response.id}`;
          
          console.log("Bot response starting:", { responseId: response.id, botId });
          
          setMessages(prev => {
            const newMessages = [
              ...prev,
              { 
                id: botId, 
                text: '', 
                isBot: true, 
                isStreaming: true 
              }
            ];
            console.log("Messages after adding bot start:", newMessages.length, newMessages.map(m => ({ id: m.id, isBot: m.isBot })));
            return newMessages;
          });
        });

        // Handle streaming chunks
        newSocket.on('bot-response-chunk', (response: { text: string, id: string }) => {
          console.log("Bot response chunk:", { responseId: response.id, textLength: response.text.length });
          
          // Update the state
          setMessages(prev => {
            const updatedMessages = prev.map(msg => 
              msg.id.includes(`-${response.id}`) // Match any ID containing the response ID
                ? { ...msg, text: msg.text + response.text }
                : msg
            );
            const updatedMsg = updatedMessages.find(msg => msg.id.includes(`-${response.id}`));
            console.log("Updated bot message:", updatedMsg ? { id: updatedMsg.id, textLength: updatedMsg.text.length } : "No matching message found");
            return updatedMessages;
          });
        });

        // Handle streaming errors, including rate limits
        newSocket.on('bot-response-error', (response: any) => {
          console.error("Received error response:", JSON.stringify(response, null, 2));

          // Extract error information from any possible structure
          let errorType: 'rate_limit' | 'other';
          let errorMessage = '';
          let retryAfter = 60; // Default to 60 seconds for rate limits
          
          try {
            // Handle Anthropic's error format first (most specific)
            if (response.error?.error?.type === 'rate_limit_error') {
              errorType = 'rate_limit';
              errorMessage = response.error.error.message;
              console.log("Detected Anthropic rate limit error");
            }
            // Handle string error
            else if (typeof response.error === 'string') {
              errorType = response.error.toLowerCase().includes('rate_limit') ? 'rate_limit' : 'other';
              errorMessage = response.error;
            } 
            // Handle direct error object
            else if (response.error?.type) {
              errorType = response.error.type.toLowerCase().includes('rate_limit') ? 'rate_limit' : 'other';
              errorMessage = response.error.message;
            }
            // Handle completely unknown format
            else {
              errorType = 'other';
              errorMessage = 'Unknown error occurred';
            }

            // Extract retry after if available
            if (response.error?.retryAfter) {
              retryAfter = response.error.retryAfter;
            } else if (response.error?.details?.retryAfter) {
              retryAfter = response.error.details.retryAfter;
            }

            console.log("Parsed error details:", { errorType, errorMessage, retryAfter });
          } catch (e) {
            console.error("Error parsing error response:", e);
            errorType = 'other';
            errorMessage = 'Error parsing server response';
          }

          const isRateLimit = errorType === 'rate_limit';
          
          // Create user-friendly messages
          const friendlyMessage = isRateLimit 
            ? "Xin lỗi bạn! Yitam đang nhận quá nhiều tin nhắn và cần nghỉ ngơi một chút." 
            : "Đã xảy ra lỗi khi xử lý phản hồi. Vui lòng thử lại sau.";

          // Create the error object with guaranteed structure
          const errorObject = {
            type: errorType,
            message: `${friendlyMessage}\n\n${errorMessage}`,
            retryAfter: isRateLimit ? retryAfter : undefined
          } as const;

          console.log("Created error object:", errorObject);

          // Update messages in a single operation
          setMessages(prevMessages => {
            // Find the last bot message that was streaming
            const lastStreamingMessage = [...prevMessages].reverse().find(msg => msg.isBot && msg.isStreaming);
            console.log("Found streaming message:", lastStreamingMessage);

            let newMessages;
            if (lastStreamingMessage) {
              // Update the existing streaming message with the error
              newMessages = prevMessages.map(msg => 
                msg.id === lastStreamingMessage.id
                  ? { 
                      ...msg, 
                      isStreaming: false, 
                      error: errorObject,
                      text: msg.text || 'Đã xảy ra lỗi trong quá trình xử lý.'
                    }
                  : msg
              );
            } else {
              // If no streaming message found, add a new error message
              const newMessage: Message = {
                id: `bot-${Date.now()}-error`,
                text: 'Đã xảy ra lỗi trong quá trình xử lý.',
                isBot: true,
                isStreaming: false,
                error: errorObject
              };
              newMessages = [...prevMessages, newMessage];
            }

            console.log("Updated messages:", newMessages);
            return newMessages;
          });

          // Handle rate limit UI state
          if (isRateLimit) {
            setIsConnected(false);
            const timer = setTimeout(() => {
              setIsConnected(true);
            }, retryAfter * 1000);

            // Cleanup timer if component unmounts
            return () => clearTimeout(timer);
          }
        });

        // Handle end of streaming response
        newSocket.on('bot-response-end', (response: { id: string }) => {
          console.log("Bot response ended:", { responseId: response.id });
          
          setMessages(prev => {
            const finalMessages = prev.map(msg => {
              if (msg.id.includes(`-${response.id}`)) {
                // If the message is empty when streaming ends, add an error message
                if (!msg.text.trim()) {
                  return {
                    ...msg,
                    isStreaming: false,
                    text: 'Đã xảy ra lỗi trong quá trình xử lý.',
                    error: {
                      type: 'other' as const,
                      message: 'Không nhận được phản hồi từ hệ thống. Vui lòng thử lại.'
                    }
                  };
                }
                return { ...msg, isStreaming: false };
              }
              return msg;
            });
            return finalMessages;
          });
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
    
    // Check if this exact message was just sent to prevent duplicates
    if (lastMessageRef.current === text) {
      console.log("Preventing duplicate message:", text);
      return;
    }
    
    // Store this message as the last one sent
    lastMessageRef.current = text;
    
    // Create a user message with a very unique ID to ensure React treats it as a new item
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const userMessage: Message = {
      id: `user-${timestamp}-${randomId}`,
      text,
      isBot: false
    };
    
    console.log("🚀 SENDING MESSAGE:", { text, id: userMessage.id });
    
    // Update React state for the user message - use functional update to ensure we're working with latest state
    setMessages(prevMessages => {
      const newMessages = [...prevMessages, userMessage];
      console.log("Messages after adding:", newMessages.length, newMessages.map(m => ({ id: m.id, isBot: m.isBot })));
      return newMessages;
    });
    
    // Force a rerender by updating an unrelated state
    setHasUserSentMessage(true);
    setIsPersonaLocked(true);
    
    // Find selected persona
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === selectedPersonaId) || AVAILABLE_PERSONAS[0];
    
    // Send to server
    socket.emit('chat-message', {
      message: text,
      personaId: selectedPersonaId,
      domains: selectedPersona.domains
    });
    
    // Force check - add the user message to the DOM directly if React state isn't updating
    setTimeout(() => {
      const chatContainer = document.getElementById('yitam-chat-container');
      if (!chatContainer) return;
      
      const chatMessagesList = chatContainer.querySelectorAll('[data-message-type]');
      const hasUserMessageInDOM = Array.from(chatMessagesList).some(el => 
        el.getAttribute('data-message-type') === 'user' && 
        el.textContent?.includes(text)
      );
      
      if (!hasUserMessageInDOM) {
        console.log("User message not found in DOM, forcing direct addition");
        
        // Create a user message element using the same styling as in the ChatBox component
        const messageDiv = document.createElement('div');
        messageDiv.className = 'mb-3 flex w-full justify-end';
        messageDiv.setAttribute('data-message-id', userMessage.id);
        messageDiv.setAttribute('data-message-type', 'user');
        
        const innerDiv = document.createElement('div');
        innerDiv.className = 'max-w-[80%]';
        innerDiv.style.display = 'block';
        
        const bubble = document.createElement('div');
        bubble.className = 'p-[10px_14px] rounded-[8px] text-[0.95rem] leading-[1.5] bg-[#5D4A38] text-white rounded-[8px_8px_0_8px]';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'whitespace-pre-wrap text-white';
        textDiv.textContent = text;
        bubble.appendChild(textDiv);
        
        const label = document.createElement('div');
        label.className = 'text-xs text-gray-500 ml-2 mt-1';
        label.textContent = 'Bạn';
        
        innerDiv.appendChild(bubble);
        innerDiv.appendChild(label);
        messageDiv.appendChild(innerDiv);
        
        // Check if we have only a welcome message or no messages
        if (chatMessagesList.length === 0 || 
            (chatMessagesList.length === 1 && 
             chatContainer.textContent?.includes('Xin chào'))) {
          // If this is the first user message, replace the welcome div
          chatContainer.innerHTML = '';
          chatContainer.appendChild(messageDiv);
        } else {
          // Find where to insert the message based on timestamp
          const timestamp = parseInt(userMessage.id.split('-')[1], 10);
          let insertAfterNode = null;
          
          // Find the last message with a timestamp less than our new message
          for (let i = chatMessagesList.length - 1; i >= 0; i--) {
            const msgId = chatMessagesList[i].getAttribute('data-message-id') || '';
            const msgTimestamp = parseInt((msgId.match(/(\d+)/) || ['', '0'])[1], 10);
            
            if (msgTimestamp < timestamp) {
              insertAfterNode = chatMessagesList[i];
              break;
            }
          }
          
          if (insertAfterNode) {
            // Insert after the found node
            insertAfterNode.after(messageDiv);
          } else {
            // Insert at the beginning (after welcome message if present)
            const welcomeMsg = chatContainer.querySelector('[data-message-id="welcome"]');
            if (welcomeMsg) {
              welcomeMsg.after(messageDiv);
            } else {
              // No welcome message, just prepend
              chatContainer.prepend(messageDiv);
            }
          }
        }
        
        // Scroll to the newly added message
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 100);
  };
  
  const handleSelectPersona = (personaId: string) => {
    if (isPersonaLocked) return; // Don't allow changes if locked
    
    // Update the selected persona
    setSelectedPersonaId(personaId);
    
    // Find the newly selected persona
    const selectedPersona = AVAILABLE_PERSONAS.find((p: Persona) => p.id === personaId) || AVAILABLE_PERSONAS[0];
    
    // Update the welcome message with the new persona
    setMessages([
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
    setMessages([
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
            
            {/* Persona selector container */}
            <div className="flex justify-center md:justify-end px-2 pb-2">
              <TailwindPersonaSelector
                onSelectPersona={handleSelectPersona}
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
                  (() => {
                    // Sort messages by timestamp before rendering
                    const sortedMessages = [...messages].sort((a, b) => {
                      // Extract timestamps from IDs
                      const getTimestamp = (id: string) => {
                        const match = id.match(/-(\d+)-/);
                        return match ? parseInt(match[1], 10) : 0;
                      };
                      
                      // Welcome message always first
                      if (a.id === 'welcome') return -1;
                      if (b.id === 'welcome') return 1;
                      
                      // Compare by timestamp
                      return getTimestamp(a.id) - getTimestamp(b.id);
                    });
                    
                    console.log("Rendering sorted messages:", sortedMessages.map(m => ({
                      id: m.id,
                      isBot: m.isBot,
                      textLength: m.text.length,
                      isStreaming: m.isStreaming
                    })));
                    
                    return sortedMessages.map((message) => (
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
                    ));
                  })()
                )}
              </div>
              
              {/* Show sample questions only when we have just the welcome message and no user interaction yet */}
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
      </>
    </ConsentProvider>
  );
}

export default TailwindApp; 