import React from 'react';
import { Topic } from '../../db/ChatHistoryDB';

interface TopicMetadataProps {
  topic: Topic;
  className?: string;
}

const TailwindTopicMetadata: React.FC<TopicMetadataProps> = ({ topic, className = '' }) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate token average per message
  const avgTokens = topic.messageCnt && topic.totalTokens 
    ? Math.round(topic.totalTokens / topic.messageCnt) 
    : 0;

  return (
    <div className={`bg-white rounded-lg shadow p-5 ${className}`}>
      <h3 className="text-lg font-medium text-[#3A2E22] mb-4 truncate">{topic.title}</h3>
      
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between items-center py-1 border-b border-gray-100">
          <span className="text-gray-600 whitespace-nowrap mr-4">Tạo lúc:</span>
          <span className="font-medium text-[#3A2E22] text-right">{formatDate(topic.createdAt)}</span>
        </div>
        
        <div className="flex justify-between items-center py-1 border-b border-gray-100">
          <span className="text-gray-600 whitespace-nowrap mr-4">Hoạt động gần đây:</span>
          <span className="font-medium text-[#3A2E22] text-right">{formatDate(topic.lastActive)}</span>
        </div>
        
        <div className="flex justify-between items-center py-1 border-b border-gray-100">
          <span className="text-gray-600 whitespace-nowrap mr-4">Tổng tin nhắn:</span>
          <span className="font-medium text-[#3A2E22]">{topic.messageCnt || 0}</span>
        </div>
        
        <div className="flex justify-between items-center py-1 border-b border-gray-100">
          <span className="text-gray-600 whitespace-nowrap mr-4">Tin nhắn của bạn:</span>
          <span className="font-medium text-[#3A2E22]">{topic.userMessageCnt || 0}</span>
        </div>
        
        <div className="flex justify-between items-center py-1 border-b border-gray-100">
          <span className="text-gray-600 whitespace-nowrap mr-4">Tin nhắn của AI:</span>
          <span className="font-medium text-[#3A2E22]">{topic.assistantMessageCnt || 0}</span>
        </div>
        
        <div className="flex justify-between items-center py-1 border-b border-gray-100">
          <span className="text-gray-600 whitespace-nowrap mr-4">Tổng tokens:</span>
          <span className="font-medium text-[#3A2E22]">{topic.totalTokens || 0}</span>
        </div>
        
        <div className="flex justify-between items-center py-1 border-b border-gray-100">
          <span className="text-gray-600 whitespace-nowrap mr-4">Trung bình tokens:</span>
          <span className="font-medium text-[#3A2E22]">{avgTokens}</span>
        </div>
        
        {topic.model && (
          <div className="flex justify-between items-center py-1 border-b border-gray-100">
            <span className="text-gray-600 whitespace-nowrap mr-4">Model:</span>
            <span className="font-medium text-[#3A2E22] text-right">{topic.model}</span>
          </div>
        )}
        
        {topic.systemPrompt && (
          <div className="py-1 mt-3">
            <div className="text-gray-600 mb-2">System Prompt:</div>
            <div className="p-3 bg-gray-50 rounded text-[#3A2E22] text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {topic.systemPrompt}
            </div>
          </div>
        )}
      </div>
      
      {topic.pinnedState && (
        <div className="mt-4 flex items-center text-sm text-[#5D4A38]">
          <svg className="h-4 w-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span>Chủ đề này đã được ghim</span>
        </div>
      )}
    </div>
  );
};

export default TailwindTopicMetadata; 