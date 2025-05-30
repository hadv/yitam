import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '../../types/chat';
import TailwindToolCallParser from './TailwindToolCallParser';
import { AVAILABLE_PERSONAS } from './TailwindPersonaSelector';

interface TailwindMessageDisplayProps {
  messages: Message[];
  currentPersonaId: string;
  onDeleteMessage?: (messageId: string) => void;
  pageSize?: number; // Number of messages to display per page
}

const TailwindMessageDisplay: React.FC<TailwindMessageDisplayProps> = ({ 
  messages, 
  currentPersonaId,
  onDeleteMessage,
  pageSize = 30 // Default to 30 messages per page
}) => {
  const [showActionsForId, setShowActionsForId] = useState<string | null>(null);
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
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
  
  // Effect to update visible messages when sortedMessages changes
  useEffect(() => {
    // If we have an ongoing chat, always show the latest messages
    if (sortedMessages.length > 0 && sortedMessages[sortedMessages.length - 1].isStreaming) {
      // Always show all messages when streaming is happening
      setVisibleMessages(sortedMessages);
      return;
    }
    
    // If total messages are less than pageSize, show all
    if (sortedMessages.length <= pageSize) {
      setVisibleMessages(sortedMessages);
      return;
    }
    
    // Otherwise, show the latest page of messages
    const startIndex = Math.max(0, sortedMessages.length - (page * pageSize));
    const messagesToShow = sortedMessages.slice(startIndex);
    setVisibleMessages(messagesToShow);
  }, [sortedMessages, page, pageSize]);

  // Setup intersection observer for infinite scrolling
  useEffect(() => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoadingMore && visibleMessages.length < sortedMessages.length) {
          setIsLoadingMore(true);
          // Simulate loading delay to prevent rapid loading
          setTimeout(() => {
            setPage((prevPage) => prevPage + 1);
            setIsLoadingMore(false);
          }, 300);
        }
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );
    
    // Observe the load more div
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isLoadingMore, visibleMessages.length, sortedMessages.length]);

  // Reset pagination when messages change drastically (like switching topics)
  useEffect(() => {
    setPage(1);
  }, [messages.length === 0]);

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
      {/* Load more indicator for infinite scrolling */}
      {visibleMessages.length < sortedMessages.length && (
        <div 
          ref={loadMoreRef}
          className="text-center py-4 text-sm text-gray-500"
        >
          {isLoadingMore ? (
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#5D4A38]"></div>
              <span className="ml-2">Đang tải tin nhắn cũ hơn...</span>
            </div>
          ) : (
            <button 
              onClick={() => setPage(prev => prev + 1)}
              className="px-3 py-1 bg-[#F2EEE5] hover:bg-[#E6DFD1] rounded-md text-[#5D4A38] transition-colors"
            >
              Tải thêm tin nhắn
            </button>
          )}
        </div>
      )}
      
      {/* Messages */}
      {visibleMessages.map((message) => (
        <div 
          key={message.id} 
          className={`mb-3 ${message.isBot ? 'self-start' : 'self-end'} max-w-[80%] ${!message.isBot ? 'ml-auto' : ''}`}
          style={{ display: 'block' }}
          data-message-id={message.id}
          data-message-type={message.isBot ? 'bot' : 'user'}
          data-is-streaming={message.isStreaming ? 'true' : 'false'}
          onMouseEnter={() => setShowActionsForId(message.id)}
          onMouseLeave={() => setShowActionsForId(null)}
        >
          <div className="relative">
            {/* Delete button (visible on hover) */}
            {onDeleteMessage && showActionsForId === message.id && !message.isStreaming && (
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
                  {(() => {
                    // Try to parse message text as JSON if it looks like JSON
                    if (message.text && message.text.trim().startsWith('{')) {
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
                    return <TailwindToolCallParser text={message.text || ''} />;
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
                <div className="whitespace-pre-wrap text-white">{message.text || ''}</div>
              )}
            </div>
            <div className="text-xs text-gray-500 ml-2 mt-1">
              {message.isBot 
                ? (AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0]).displayName
                : 'Bạn'
              }
            </div>
          </div>
        </div>
      ))}
      
      {/* Message count indicator */}
      {sortedMessages.length > visibleMessages.length && (
        <div className="text-center mb-2 text-xs text-gray-500">
          Hiển thị {visibleMessages.length} trong tổng số {sortedMessages.length} tin nhắn
        </div>
      )}
    </>
  );
};

export default TailwindMessageDisplay; 