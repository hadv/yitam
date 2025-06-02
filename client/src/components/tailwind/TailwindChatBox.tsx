import React, { useEffect, useRef, useState } from 'react';
import TailwindToolCallParser from './TailwindToolCallParser';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
  isError?: boolean;
  error?: {
    type: 'rate_limit' | 'credit_balance' | 'overloaded' | 'other';
    message: string;
    retryAfter?: number; // seconds to wait before retrying
  };
}

interface ChatBoxProps {
  messages: Message[];
}

const TailwindChatBox: React.FC<ChatBoxProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Debug log for messages with errors
  useEffect(() => {
    const messagesWithErrors = messages.filter(msg => msg.error);
    if (messagesWithErrors.length > 0) {
      console.log("Messages with errors:", messagesWithErrors);
    }
  }, [messages]);

  // Handle countdown for rate limit
  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.error?.type === 'rate_limit' && latestMessage.error.retryAfter) {
      setRetryCountdown(latestMessage.error.retryAfter);
      const interval = setInterval(() => {
        setRetryCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [messages]);

  // Track scroll position and update auto-scroll behavior
  const handleScroll = () => {
    if (!chatBoxRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
    setShouldAutoScroll(isAtBottom);
  };

  // Auto-scroll to bottom only if user was already at bottom or it's a new message
  useEffect(() => {
    if (!shouldAutoScroll && messages[messages.length - 1]?.isStreaming) return;
    
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: shouldAutoScroll ? 'smooth' : 'auto' });
      }
    };

    scrollToBottom();
  }, [messages, shouldAutoScroll]);

  // Ensure messages are sorted by their timestamp ID (user-timestamp-randomid format)
  const sortedMessages = [...messages].sort((a, b) => {
    // Extract timestamps from IDs if possible
    const getTimestamp = (id: string) => {
      const match = id.match(/user-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    
    const timestampA = getTimestamp(a.id);
    const timestampB = getTimestamp(b.id);
    
    // Welcome message always first
    if (a.id === 'welcome') return -1;
    if (b.id === 'welcome') return 1;
    
    // Compare by timestamp if available, otherwise keep original order
    return timestampA && timestampB ? timestampA - timestampB : 0;
  });

  return (
    <div 
      className="flex flex-col p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-y-auto"
      ref={chatBoxRef}
      onScroll={handleScroll}
    >
      {sortedMessages.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-[#3A2E22] opacity-60 text-[1.1rem]">
          Xin chào! Yitam đang lắng nghe!
        </div>
      ) : (
        <>
          {sortedMessages.map((message, index) => (
            <div 
              key={`${message.id}-${index}`} 
              className={`mb-3 flex w-full ${message.isBot ? 'justify-start' : 'justify-end'}`}
              data-message-id={message.id}
              data-message-type={message.isBot ? 'bot' : 'user'}
            >
              <div 
                className={`max-w-[80%]`}
                style={{ display: 'block' }}
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
                      {message.isError ? (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
                          <div className="flex items-center mb-2">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="font-medium">{message.text}</div>
                          </div>
                        </div>
                      ) : (
                        <TailwindToolCallParser text={message.text} />
                      )}
                      {message.isStreaming && (
                        <span className="inline-flex items-center ml-1.5">
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                        </span>
                      )}
                      {!message.isError && message.error && (
                        <div className={`mt-4 p-4 rounded-lg border ${
                          message.error.type === 'rate_limit'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : message.error.type === 'credit_balance'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : message.error.type === 'overloaded'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                          <div className="flex items-center mb-2">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                                d={message.error.type === 'rate_limit'
                                  ? "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" // Clock icon for rate limit
                                  : message.error.type === 'credit_balance'
                                  ? "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" // Credit card icon for balance
                                  : message.error.type === 'overloaded'
                                  ? "M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" // Signal icon for overloaded
                                  : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" // Warning icon for other errors
                                }
                              />
                            </svg>
                            <div className="font-medium">
                              {message.error.message.split('\n')[0]}
                            </div>
                          </div>
                          {message.error.message.split('\n').slice(1).map((line, index) => (
                            line && <div key={index} className="mt-2 text-sm whitespace-pre-wrap">{line}</div>
                          ))}
                          {message.error.type === 'credit_balance' && (
                            <div className="mt-3">
                              <a 
                                href="https://console.anthropic.com/account/billing" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-sm font-medium text-red-700 hover:text-red-800"
                              >
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Đi đến trang thanh toán Anthropic
                              </a>
                            </div>
                          )}
                          {message.error.type === 'rate_limit' && message.error.retryAfter && (
                            <div className="mt-3 text-sm font-medium">
                              Hệ thống sẽ tự động tiếp tục sau {message.error.retryAfter} giây
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-white">{message.text}</div>
                  )}
                </div>
                <div className="text-xs text-gray-500 ml-2 mt-1">
                  {message.isBot ? 'Yitam' : 'Bạn'}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      <div ref={messagesEndRef} />

      <style>
        {`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
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
        `}
      </style>
    </div>
  );
};

export default TailwindChatBox; 