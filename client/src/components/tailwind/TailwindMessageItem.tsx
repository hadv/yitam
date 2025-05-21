import React, { useState } from 'react';
import { Message } from '../../db/ChatHistoryDB';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageItemProps {
  message: Message;
  onDelete?: () => void;
  className?: string;
}

const TailwindMessageItem: React.FC<MessageItemProps> = ({
  message,
  onDelete,
  className = ''
}) => {
  const [showActions, setShowActions] = useState(false);
  
  // Format timestamp to a readable format
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };
  
  // Format date when the message was sent
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check if the message was sent today
    if (date.toDateString() === today.toDateString()) {
      return 'Hôm nay';
    }
    
    // Check if the message was sent yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Hôm qua';
    }
    
    // Otherwise return the full date
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };
  
  const isUser = message.role === 'user';
  
  return (
    <div 
      className={`
        ${isUser ? 'ml-12' : 'mr-12'} 
        ${className}
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Message metadata (date, time) */}
      <div className="flex justify-between items-center mb-1 text-xs text-gray-500">
        <div className="flex items-center">
          <span className="mr-2">{formatDate(message.timestamp)}</span>
          <span>{formatTime(message.timestamp)}</span>
        </div>
        
        {/* Message actions */}
        {onDelete && showActions && (
          <button 
            onClick={onDelete}
            className="text-gray-400 hover:text-red-500 transition-colors duration-150 focus:outline-none"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Message content */}
      <div className={`
        p-4 rounded-lg break-words
        ${isUser 
          ? 'bg-[#5D4A38] text-white' 
          : 'bg-white border border-gray-200 text-[#3A2E22]'
        }
      `}>
        {message.type === 'markdown' ? (
          <div className={`prose ${isUser ? 'prose-invert' : ''} max-w-none text-sm`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        )}
        
        {/* Display message metadata if available */}
        {message.tokens && (
          <div className={`mt-2 text-xs ${isUser ? 'text-gray-300' : 'text-gray-500'} flex justify-end`}>
            {message.tokens} tokens
            {message.modelVersion && (
              <span className="ml-2">· {message.modelVersion}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TailwindMessageItem; 