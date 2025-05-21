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
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      <h3 className="text-lg font-medium text-[#3A2E22] mb-2">{topic.title}</h3>
      
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="col-span-2 flex justify-between py-1 border-b border-gray-100">
          <span className="text-gray-600">Tạo lúc:</span>
          <span className="font-medium text-[#3A2E22]">{formatDate(topic.createdAt)}</span>
        </div>
        
        <div className="col-span-2 flex justify-between py-1 border-b border-gray-100">
          <span className="text-gray-600">Hoạt động gần đây:</span>
          <span className="font-medium text-[#3A2E22]">{formatDate(topic.lastActive)}</span>
        </div>
        
        <div className="flex justify-between py-1 border-b border-gray-100">
          <span className="text-gray-600">Tổng tin nhắn:</span>
          <span className="font-medium text-[#3A2E22]">{topic.messageCnt || 0}</span>
        </div>
        
        <div className="flex justify-between py-1 border-b border-gray-100">
          <span className="text-gray-600">Tin nhắn của bạn:</span>
          <span className="font-medium text-[#3A2E22]">{topic.userMessageCnt || 0}</span>
        </div>
        
        <div className="flex justify-between py-1 border-b border-gray-100">
          <span className="text-gray-600">Tin nhắn của AI:</span>
          <span className="font-medium text-[#3A2E22]">{topic.assistantMessageCnt || 0}</span>
        </div>
        
        <div className="flex justify-between py-1 border-b border-gray-100">
          <span className="text-gray-600">Tổng tokens:</span>
          <span className="font-medium text-[#3A2E22]">{topic.totalTokens || 0}</span>
        </div>
        
        <div className="flex justify-between py-1 border-b border-gray-100">
          <span className="text-gray-600">Trung bình tokens:</span>
          <span className="font-medium text-[#3A2E22]">{avgTokens}</span>
        </div>
        
        {topic.model && (
          <div className="col-span-2 flex justify-between py-1 border-b border-gray-100">
            <span className="text-gray-600">Model:</span>
            <span className="font-medium text-[#3A2E22]">{topic.model}</span>
          </div>
        )}
        
        {topic.systemPrompt && (
          <div className="col-span-2 py-1">
            <div className="text-gray-600 mb-1">System Prompt:</div>
            <div className="p-2 bg-gray-50 rounded text-[#3A2E22] text-xs font-mono whitespace-pre-wrap">
              {topic.systemPrompt}
            </div>
          </div>
        )}
      </div>
      
      {topic.pinnedState && (
        <div className="mt-3 flex items-center text-sm text-[#5D4A38]">
          <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Chủ đề này đã được ghim
        </div>
      )}
    </div>
  );
};

export default TailwindTopicMetadata; 