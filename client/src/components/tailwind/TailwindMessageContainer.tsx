import React, { useEffect } from 'react';
import TailwindMessageThread from './TailwindMessageThread';
import TailwindMessageSender from './TailwindMessageSender';
import TailwindMessagePersistence from './TailwindMessagePersistence';
import db, { Topic } from '../../db/ChatHistoryDB';
import { useLoading } from '../../contexts/LoadingContext';
import LoadingState from './common/LoadingState';

interface MessageContainerProps {
  userId: string;
  topicId?: number;
  onSend?: (message: string) => void;
  onShareConversation?: (topicId: number) => void;
  className?: string;
}

const TailwindMessageContainer: React.FC<MessageContainerProps> = ({
  userId,
  topicId,
  onSend,
  onShareConversation,
  className = ''
}) => {
  const { startLoading, stopLoading, setError } = useLoading();
  const [currentTopic, setCurrentTopic] = React.useState<Topic | null>(null);
  
  // Load topic details when topicId changes
  useEffect(() => {
    const loadTopic = async () => {
      if (!topicId) {
        setCurrentTopic(null);
        return;
      }
      
      const loadingKey = `topic-load-${topicId}`;
      startLoading(loadingKey);
      
      try {
        const topic = await db.topics.get(topicId);
        setCurrentTopic(topic || null);
        setError(loadingKey, null);
      } catch (error) {
        console.error('Error loading topic:', error);
        setError(loadingKey, 'Không thể tải chủ đề. Vui lòng thử lại sau.');
      } finally {
        stopLoading(loadingKey);
      }
    };
    
    loadTopic();
  }, [topicId, startLoading, stopLoading, setError]);

  // Generate a unique loading key for this topic
  const loadingKey = topicId ? `topic-load-${topicId}` : 'no-topic';

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

            <div className="flex items-center gap-2">
              {/* Share button */}
              {onShareConversation && currentTopic.messageCnt && currentTopic.messageCnt > 0 && (
                <button
                  onClick={() => onShareConversation(currentTopic.id!)}
                  className="flex items-center px-3 py-1.5 text-sm text-[#5D4A38] hover:text-[#4A3A2A] hover:bg-gray-100 rounded-md transition-colors"
                  title="Chia sẻ cuộc trò chuyện"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                  Chia sẻ
                </button>
              )}

              {currentTopic.model && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  {currentTopic.model.includes('opus') ? 'Claude 3 Opus' :
                   currentTopic.model.includes('sonnet') ? 'Claude 3 Sonnet' :
                   currentTopic.model.includes('haiku') ? 'Claude 3 Haiku' : 'Claude'}
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Message thread with loading state */}
        <div className="flex-1 overflow-hidden">
          <LoadingState 
            loadingKey={loadingKey}
            loadingMessage="Đang tải tin nhắn..."
          >
            <TailwindMessageThread
              userId={userId}
              topicId={topicId}
              className="h-full"
            />
          </LoadingState>
        </div>
        
        {/* Message input */}
        <div className="p-4">
          <TailwindMessageSender
            topicId={topicId}
            onSend={onSend}
            disabled={!topicId}
            placeholder={topicId ? "Nhập tin nhắn của bạn..." : "Chọn một chủ đề để bắt đầu"}
          />
        </div>
      </div>
    </TailwindMessagePersistence>
  );
};

export default TailwindMessageContainer; 