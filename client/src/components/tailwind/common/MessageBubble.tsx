import React, { memo, useMemo, useState, useEffect } from 'react';
import TailwindToolCallParser from '../TailwindToolCallParser';
import { Message } from '../../../types/chat';
import { AVAILABLE_PERSONAS } from '../TailwindPersonaSelector';

interface MessageBubbleProps {
  message: Message;
  currentPersonaId: string;
  showActions: boolean;
  onDeleteMessage?: (messageId: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentPersonaId,
  showActions,
  onDeleteMessage
}) => {
  // State for countdown timer if there's a rate limit error
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Handle countdown for rate limit errors
  useEffect(() => {
    if (message.error?.type === 'rate_limit' && message.error.retryAfter) {
      setRetryCountdown(message.error.retryAfter);
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
  }, [message.error]);

  // Memoize the error parsing logic
  const parsedErrorContent = useMemo(() => {
    if (message.text && message.text.trim().startsWith('{')) {
      try {
        const parsedError = JSON.parse(message.text);
        if (parsedError.type && parsedError.message) {
          return {
            type: parsedError.type,
            message: parsedError.message
          };
        }
      } catch (e) {
        // Ignore JSON parsing errors and fall back to normal rendering
      }
    }
    return null;
  }, [message.text]);

  // Memoize persona name lookup
  const personaName = useMemo(() => {
    return message.isBot 
      ? AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId)?.displayName || 'Yitam'
      : 'Bạn';
  }, [message.isBot, currentPersonaId]);

  return (
    <div className="relative">
      {/* Delete button (visible on hover) */}
      {onDeleteMessage && showActions && !message.isStreaming && (
        <button 
          onClick={() => onDeleteMessage(message.id)}
          className="absolute top-0 right-0 -mt-2 -mr-2 bg-white rounded-full p-1 shadow-md text-gray-500 hover:text-red-500 transition-colors z-10"
          aria-label="Delete message"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
      
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
            ) : parsedErrorContent ? (
              <div className={`flex items-start gap-3 ${
                parsedErrorContent.type === 'credit_balance' 
                  ? 'text-red-700' 
                  : parsedErrorContent.type === 'rate_limit' 
                    ? 'text-orange-700' 
                    : 'text-[#3A2E22]'
              }`}>
                {parsedErrorContent.type === 'credit_balance' && (
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                )}
                {parsedErrorContent.type === 'rate_limit' && (
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <div>
                  <p>{parsedErrorContent.message}</p>
                  {parsedErrorContent.type === 'credit_balance' && (
                    <div className="mt-2">
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
                </div>
              </div>
            ) : (
              // Standard rendering of bot message using parser
              <TailwindToolCallParser text={message.text} />
            )}
            
            {message.isStreaming && (
              <span className="inline-flex items-center ml-1.5">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </span>
            )}

            {/* Error display (not isError but has error property) */}
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
                    Hệ thống sẽ tự động tiếp tục sau {retryCountdown || message.error.retryAfter} giây
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // User message - with correct text color
          <div className="whitespace-pre-wrap text-white">
            {message.text}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 ml-2 mt-1">
        {personaName}
      </div>

      {/* CSS styles for typing animation dots */}
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
    </div>
  );
};

// Optimize with React.memo to prevent unnecessary re-renders
// Only re-render if props change
export default memo(MessageBubble, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.text === nextProps.message.text &&
    prevProps.message.isStreaming === nextProps.message.isStreaming &&
    prevProps.currentPersonaId === nextProps.currentPersonaId &&
    prevProps.showActions === nextProps.showActions &&
    JSON.stringify(prevProps.message.error) === JSON.stringify(nextProps.message.error)
  );
}); 