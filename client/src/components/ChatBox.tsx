import React, { useEffect, useRef } from 'react';
import './ChatBox.css';
import ToolCallParser from './ToolCallParser';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
}

interface ChatBoxProps {
  messages: Message[];
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-box">
      {messages.length === 0 ? (
        <div className="empty-chat">Xin chào! Yitam đang lắng nghe!</div>
      ) : (
        messages.map((message) => (
          <div 
            key={message.id} 
            className={`message ${message.isBot ? 'bot' : 'user'}`}
          >
            <div className="message-content">
              {message.isBot ? (
                <div className="message-text">
                  <ToolCallParser text={message.text} />
                  {message.isStreaming && (
                    <span className="typing-indicator">
                      <span className="dot"></span>
                      <span className="dot"></span>
                      <span className="dot"></span>
                    </span>
                  )}
                </div>
              ) : (
                <span className="message-text">{message.text}</span>
              )}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatBox; 