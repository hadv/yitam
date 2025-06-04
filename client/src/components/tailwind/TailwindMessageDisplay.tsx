import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Message } from '../../types/chat';
import { AVAILABLE_PERSONAS } from './TailwindPersonaSelector';
import MessageBubble from './common/MessageBubble';

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

  // Debug: Log visible messages to identify issues
  useEffect(() => {
    console.log("Current messages:", visibleMessages.map(m => ({
      id: m.id,
      isBot: m.isBot,
      text: m.text?.substring(0, 30) + (m.text?.length > 30 ? '...' : '')
    })));
  }, [visibleMessages]);

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
          <MessageBubble 
            message={message}
            currentPersonaId={currentPersonaId}
            showActions={showActionsForId === message.id}
            onDeleteMessage={onDeleteMessage}
          />
        </div>
      ))}
    </>
  );
};

export default TailwindMessageDisplay; 