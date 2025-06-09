import React, { useState, useEffect, useRef, useCallback } from 'react';
import db, { Message } from '../../db/ChatHistoryDB';
import TailwindMessageItem from './TailwindMessageItem';
import { useLoading } from '../../contexts/LoadingContext';

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
  const { startLoading, stopLoading, setError, isLoading } = useLoading();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [page, setPage] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Generate loading keys
  const messagesLoadingKey = topicId ? `messages-load-${topicId}` : 'no-messages';
  const loadMoreKey = topicId ? `load-more-${topicId}` : 'no-load-more';
  const deleteMessageKey = `delete-message`;

  // Function to load messages with pagination
  const loadMessages = useCallback(async (reset = false) => {
    if (!topicId || isLoading(messagesLoadingKey) || (!hasMoreMessages && !reset)) return;

    const loadingKey = reset ? messagesLoadingKey : loadMoreKey;
    try {
      startLoading(loadingKey);
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
      
      // Clear any existing errors
      setError(loadingKey, null);
    } catch (error) {
      console.error('Error loading messages:', error);
      setError(loadingKey, 'Không thể tải tin nhắn. Vui lòng thử lại sau.');
    } finally {
      stopLoading(loadingKey);
    }
  }, [topicId, isLoading, hasMoreMessages, page, pageSize, startLoading, stopLoading, setError, messagesLoadingKey, loadMoreKey]);

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
      if (entries[0].isIntersecting && hasMoreMessages && !isLoading(loadMoreKey)) {
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
  }, [hasMoreMessages, isLoading, loadMessages, loadMoreKey]);

  // Handle message deletion with optimistic updates
  const handleDeleteMessage = (messageId: number) => {
    setShowDeleteModal(messageId);
  };

  // Confirm deletion of a message
  const confirmDeleteMessage = async () => {
    if (showDeleteModal) {
      startLoading(deleteMessageKey);
      
      try {
        // Find the message to delete
        const messageToDelete = messages.find(m => m.id === showDeleteModal);
        if (!messageToDelete) {
          throw new Error('Message not found');
        }
        
        // Optimistically update the UI
        setMessages(prev => prev.filter(m => m.id !== showDeleteModal));
        
        // Delete the message from database
        await db.messages.delete(showDeleteModal);
        
        // Update topic message counts (update lastActive - deletion is user activity)
        if (topicId) {
          const topic = await db.topics.get(topicId);
          if (topic) {
            const updateData: Partial<typeof topic> = {
              messageCnt: (topic.messageCnt || 0) - 1,
              lastActive: Date.now()
            };

            if (messageToDelete.role === 'user') {
              updateData.userMessageCnt = (topic.userMessageCnt || 0) - 1;
            } else {
              updateData.assistantMessageCnt = (topic.assistantMessageCnt || 0) - 1;
            }

            if (messageToDelete.tokens) {
              updateData.totalTokens = (topic.totalTokens || 0) - messageToDelete.tokens;
            }

            await db.topics.update(topicId, updateData);
          }
        }
        
        // Clear any errors
        setError(deleteMessageKey, null);
      } catch (error) {
        console.error('Error deleting message:', error);
        setError(deleteMessageKey, 'Không thể xóa tin nhắn. Vui lòng thử lại sau.');
        
        // Roll back optimistic update
        if (topicId) {
          loadMessages(true);
        }
      } finally {
        stopLoading(deleteMessageKey);
        setShowDeleteModal(null);
      }
    }
  };

  // Cancel message deletion
  const cancelDeleteMessage = () => {
    setShowDeleteModal(null);
  };

  // Check if we're loading or have an error
  const isLoadingInitial = isLoading(messagesLoadingKey);
  const isLoadingMore = isLoading(loadMoreKey);
  const hasError = !!useLoading().getError(messagesLoadingKey);

  return (
    <div 
      className={`flex flex-col h-full ${className}`}
      ref={scrollContainerRef}
    >
      {/* Message thread content */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && !isLoadingInitial && !hasError ? (
          <div className="text-center py-8 text-gray-500">
            {topicId ? 'Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.' : 'Vui lòng chọn một chủ đề để bắt đầu.'}
          </div>
        ) : (
          <>
            {/* Loading indicator at the top (older messages) */}
            {isLoadingMore && (
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
                disabled={isLoading(deleteMessageKey)}
              >
                Hủy
              </button>
              <button
                onClick={confirmDeleteMessage}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center"
                disabled={isLoading(deleteMessageKey)}
              >
                {isLoading(deleteMessageKey) && (
                  <span className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></span>
                )}
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