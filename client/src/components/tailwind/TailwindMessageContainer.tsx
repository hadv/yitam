import React, { useState, useEffect } from 'react';
import TailwindMessageThread from './TailwindMessageThread';
import TailwindMessageSender from './TailwindMessageSender';
import TailwindMessagePersistence from './TailwindMessagePersistence';
import db, { Topic } from '../../db/ChatHistoryDB';

interface MessageContainerProps {
  userId: string;
  topicId?: number;
  onSend?: (message: string) => void;
  className?: string;
}

const TailwindMessageContainer: React.FC<MessageContainerProps> = ({
  userId,
  topicId,
  onSend,
  className = ''
}) => {
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load topic details when topicId changes
  useEffect(() => {
    const loadTopic = async () => {
      if (!topicId) {
        setCurrentTopic(null);
        return;
      }
      
      setIsLoading(true);
      try {
        const topic = await db.topics.get(topicId);
        setCurrentTopic(topic || null);
      } catch (error) {
        console.error('Error loading topic:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadTopic();
  }, [topicId]);

  return (
    <TailwindMessagePersistence>
      <div className={`flex flex-col h-full bg-[#F8F6F1] ${className}`}>
        {/* Topic header */}
        {currentTopic && (
          <div className="bg-white shadow-sm p-3 flex items-center border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-medium truncate text-[#3A2E22]">
                {currentTopic.title}
              </h1>
              {currentTopic.messageCnt !== undefined && (
                <div className="text-xs text-gray-500 flex items-center">
                  <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  {currentTopic.messageCnt} tin nhắn
                </div>
              )}
            </div>
            
            {currentTopic.model && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                {currentTopic.model.includes('opus') ? 'Claude 3 Opus' : 
                 currentTopic.model.includes('sonnet') ? 'Claude 3 Sonnet' : 
                 currentTopic.model.includes('haiku') ? 'Claude 3 Haiku' : 'Claude'}
              </span>
            )}
          </div>
        )}
        
        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5D4A38]"></div>
          </div>
        )}
        
        {/* Message thread */}
        {!isLoading && (
          <div className="flex-1 overflow-hidden">
            <TailwindMessageThread
              userId={userId}
              topicId={topicId}
              className="h-full"
            />
          </div>
        )}
        
        {/* Message input */}
        <div className="p-4">
          <TailwindMessageSender
            topicId={topicId}
            onSend={onSend}
            disabled={!topicId || isLoading}
            placeholder={topicId ? "Nhập tin nhắn của bạn..." : "Chọn một chủ đề để bắt đầu"}
          />
        </div>
      </div>
    </TailwindMessagePersistence>
  );
};

export default TailwindMessageContainer; 