import React, { useMemo } from 'react';
import { Message } from '../../types/chat';
import TailwindToolCallParser from './TailwindToolCallParser';
import { AVAILABLE_PERSONAS } from './TailwindPersonaSelector';

interface TailwindMessageDisplayProps {
  messages: Message[];
  currentPersonaId: string;
}

const TailwindMessageDisplay: React.FC<TailwindMessageDisplayProps> = ({ 
  messages, 
  currentPersonaId 
}) => {
  // Sort messages by timestamp
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      // Welcome message always first
      if (a.id === 'welcome') return -1;
      if (b.id === 'welcome') return 1;
      
      // Use timestamp for sorting if available
      if (a.timestamp && b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      
      // Extract timestamps from IDs as fallback
      const getTimestamp = (id: string) => {
        // Try to extract timestamp from msg-id-timestamp format
        const match = id.match(/-(\d+)(?:-|$)/);
        if (match) return parseInt(match[1], 10);
        
        // Legacy format with timestamp in ID
        const legacyMatch = id.match(/-(\d+)-/);
        return legacyMatch ? parseInt(legacyMatch[1], 10) : 0;
      };
      
      return getTimestamp(a.id) - getTimestamp(b.id);
    });
  }, [messages]);

  if (messages.length === 0) {
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
    return (
      <div className="flex items-center justify-center h-[200px] text-[#3A2E22] opacity-60 text-[1.1rem]">
        Xin chào! {selectedPersona.displayName} đang lắng nghe!
      </div>
    );
  }

  return (
    <>
      {sortedMessages.map((message) => (
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
                {(() => {
                  // Try to parse message text as JSON if it looks like JSON
                  if (message.text.trim().startsWith('{')) {
                    try {
                      const parsedError = JSON.parse(message.text);
                      if (parsedError.type && parsedError.message) {
                        return (
                          <div className={`flex items-start gap-3 ${
                            parsedError.type === 'credit_balance' 
                              ? 'text-red-700' 
                              : parsedError.type === 'rate_limit' 
                                ? 'text-orange-700' 
                                : 'text-[#3A2E22]'
                          }`}>
                            {parsedError.type === 'credit_balance' && (
                              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h.01M11 15h.01M15 15h.01M19 15h.01M7 19h.01M11 19h.01M15 19h.01M19 19h.01M7 11h.01M11 11h.01M15 11h.01M19 11h.01M7 7h.01M11 7h.01M15 7h.01M19 7h.01" />
                              </svg>
                            )}
                            {parsedError.type === 'rate_limit' && (
                              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            <div className="flex-1">
                              <p className="m-0">{parsedError.message}</p>
                              {parsedError.type === 'credit_balance' && (
                                <a 
                                  href="https://console.anthropic.com/account/billing" 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="inline-flex items-center text-sm mt-2 text-red-700 hover:text-red-800 font-medium"
                                >
                                  Đi đến trang thanh toán
                                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      }
                    } catch (e) {
                      // If parsing fails, fall back to regular message display
                    }
                  }
                  
                  // Default message display
                  return <TailwindToolCallParser text={message.text} />;
                })()}
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
              ? (AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0]).displayName
              : 'Bạn'
            }
          </div>
        </div>
      ))}
    </>
  );
};

export default TailwindMessageDisplay; 