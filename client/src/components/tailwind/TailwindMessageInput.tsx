import React, { useState } from 'react';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
}

const TailwindMessageInput: React.FC<MessageInputProps> = ({ onSendMessage, disabled }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <form 
      className="flex p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)]" 
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Có thắc mắc gì thì bạn đừng ngại hỏi Yitam nhé!"
        disabled={disabled}
        className="flex-grow p-[10px_14px] border border-[#E6DFD1] rounded-[8px] text-base outline-none transition-colors duration-200 focus:border-[#5D4A38] disabled:bg-[#E6DFD1] disabled:cursor-not-allowed"
      />
      <button 
        type="submit" 
        disabled={disabled || !message.trim()} 
        className="ml-2.5 py-2.5 px-5 bg-[#5D4A38] text-white border-0 rounded-[8px] text-base font-medium cursor-pointer transition-colors duration-200 hover:enabled:bg-[#78A161] disabled:bg-[#E6DFD1] disabled:text-[#3A2E22] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Gửi
      </button>
    </form>
  );
};

export default TailwindMessageInput; 