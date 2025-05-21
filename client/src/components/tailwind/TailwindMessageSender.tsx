import React, { useState, useRef, useEffect } from 'react';
import { useMessagePersistence } from './TailwindMessagePersistence';

interface MessageSenderProps {
  topicId?: number;
  onSend?: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const TailwindMessageSender: React.FC<MessageSenderProps> = ({
  topicId,
  onSend,
  disabled = false,
  placeholder = 'Nhập tin nhắn của bạn...',
  className = ''
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { saveMessage } = useMessagePersistence();

  // Auto-resize textarea as content grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Handle textarea input
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  // Handle key press events (Enter to send)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle sending message
  const handleSendMessage = async () => {
    if (!message.trim() || disabled || !topicId) return;
    
    try {
      // Prepare the message data
      const timestamp = Date.now();
      const messageData = {
        timestamp,
        role: 'user' as const,
        content: message.trim(),
        type: 'text',
      };
      
      // Save message to database
      await saveMessage(topicId, messageData);
      
      // Call the onSend callback if provided
      if (onSend) {
        onSend(message.trim());
      }
      
      // Clear the input
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div className={`relative bg-white rounded-lg shadow ${className}`}>
      <textarea
        ref={textareaRef}
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full p-4 pr-12 text-[#3A2E22] bg-transparent resize-none rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5D4A38] focus:border-transparent min-h-[56px] max-h-[200px] overflow-auto"
        rows={1}
      />
      
      <button
        onClick={handleSendMessage}
        disabled={disabled || !message.trim()}
        className={`absolute right-3 bottom-3 p-2 rounded-full ${
          disabled || !message.trim()
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-[#5D4A38] text-white hover:bg-[#4A3B2C] transition-colors'
        }`}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </div>
  );
};

export default TailwindMessageSender; 