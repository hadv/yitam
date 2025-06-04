import React, { useState } from 'react';
import { Button, Input } from './common/UIComponents';

// Define props interface
interface MessageInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
}

// Main input component
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
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Có thắc mắc gì thì bạn đừng ngại hỏi Yitam nhé!"
        disabled={disabled}
        className="flex-grow"
      />
      <Button 
        type="submit"
        onClick={() => {}} // Form will handle submission
        disabled={disabled || message.trim().length === 0}
        className="ml-2.5"
      >
        Gửi
      </Button>
    </form>
  );
};

export default TailwindMessageInput; 