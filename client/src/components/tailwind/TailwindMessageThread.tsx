import React, { useState, useEffect, useRef, useCallback } from 'react';
import db, { Message } from '../../db/ChatHistoryDB';
import TailwindMessageItem from './TailwindMessageItem';

interface MessageThreadProps {
  topicId?: number;
  userId: string;
  pageSize?: number;
  className?: string;
}

const TailwindMessageThread: React.FC<MessageThreadProps> = ({
  topicId,
  userId,
  pageSize = 20,
  className = ''
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [page, setPage] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Function to load messages with pagination
  const loadMessages = useCallback(async (reset = false) => {
    if (!topicId || isLoading || (!hasMoreMessages && !reset)) return;

    try {
      setIsLoading(true);
      const currentPage = reset ? 0 : page;
      
      // Calculate offset for pagination
      const offset = currentPage * pageSize;
      
      // Fetch messages for this topic with descending order by timestamp
      const fetchedMessages = await db.messages
        .where('topicId')
        .equals(topicId)
        .reverse() // Most recent first
        .sortBy('timestamp')
        .then(messages => messages.reverse().slice(offset, offset + pageSize));
      
      // Check if there are more messages to load
      const totalCount = await db.messages
        .where('topicId')
        .equals(topicId)
        .count();
      
      const hasMore = offset + fetchedMessages.length < totalCount;
      
      // Update state
      setMessages(prev => reset ? fetchedMessages : [...prev, ...fetchedMessages]);
      setHasMoreMessages(hasMore);
      
      if (!reset) {
        setPage(currentPage + 1);
      } else {
        setPage(1);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [topicId, isLoading, hasMoreMessages, page, pageSize]);

  // Effect to load initial messages when topicId changes
  useEffect(() => {
    if (topicId) {
      // Reset state and load first page of messages
      setMessages([]);
      setHasMoreMessages(true);
      setPage(0);
      loadMessages(true);
    }
  }, [topicId, loadMessages]);

  // Setup intersection observer for infinite scrolling
  useEffect(() => {
    if (!loadingRef.current) return;

    const options = {
      root: scrollContainerRef.current,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreMessages && !isLoading) {
        loadMessages();
      }
    }, options);

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMoreMessages, isLoading, loadMessages]);

  // Handle message deletion
  const handleDeleteMessage = (messageId: number) => {
    setShowDeleteModal(messageId);
  };

  // Confirm deletion of a message
  const confirmDeleteMessage = async () => {
    if (showDeleteModal) {
      try {
        // Delete the message
        await db.messages.delete(showDeleteModal);
        
        // Update messages list
        setMessages(prev => prev.filter(m => m.id !== showDeleteModal));
        
        // Update topic message counts
        if (topicId) {
          const topic = await db.topics.get(topicId);
          if (topic) {
            const deletedMessage = messages.find(m => m.id === showDeleteModal);
            if (deletedMessage) {
              const updateData: Partial<typeof topic> = {
                messageCnt: (topic.messageCnt || 0) - 1
              };
              
              if (deletedMessage.role === 'user') {
                updateData.userMessageCnt = (topic.userMessageCnt || 0) - 1;
              } else {
                updateData.assistantMessageCnt = (topic.assistantMessageCnt || 0) - 1;
              }
              
              if (deletedMessage.tokens) {
                updateData.totalTokens = (topic.totalTokens || 0) - deletedMessage.tokens;
              }
              
              await db.topics.update(topicId, updateData);
            }
          }
        }
      } catch (error) {
        console.error('Error deleting message:', error);
      }
    }
    setShowDeleteModal(null);
  };

  // Cancel message deletion
  const cancelDeleteMessage = () => {
    setShowDeleteModal(null);
  };

  return (
    <div 
      className={`flex flex-col h-full ${className}`}
      ref={scrollContainerRef}
    >
      {/* Message thread content */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && !isLoading ? (
          <div className="text-center py-8 text-gray-500">
            {topicId ? 'Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.' : 'Vui lòng chọn một chủ đề để bắt đầu.'}
          </div>
        ) : (
          <>
            {/* Loading indicator at the top (older messages) */}
            {isLoading && page > 1 && (
              <div className="py-2 flex justify-center">
                <div className="animate-spin h-5 w-5 border-2 border-[#5D4A38] border-t-transparent rounded-full"></div>
              </div>
            )}
            
            {/* Invisible element for intersection observer */}
            {hasMoreMessages && (
              <div ref={loadingRef} className="h-1" />
            )}
            
            {/* Message list */}
            {messages.map(message => (
              <TailwindMessageItem
                key={message.id}
                message={message}
                onDelete={message.id ? () => handleDeleteMessage(message.id as number) : undefined}
              />
            ))}
          </>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-[#3A2E22] mb-4">Xác nhận xóa</h3>
            <p className="text-gray-600 mb-6">
              Bạn có chắc chắn muốn xóa tin nhắn này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDeleteMessage}
                className="px-4 py-2 border border-gray-300 rounded-md text-[#3A2E22] hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={confirmDeleteMessage}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TailwindMessageThread; 