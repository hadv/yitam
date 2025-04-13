import React, { useState } from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, disabled }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <form className="message-input-container" onSubmit={handleSubmit}>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Có thắc mắc gì thì bạn đừng ngại hỏi Yitam nhé!"
        disabled={disabled}
        className="message-input"
      />
      <button 
        type="submit" 
        disabled={disabled || !message.trim()} 
        className="send-button"
      >
        Gửi
      </button>
    </form>
  );
};

export default MessageInput; 