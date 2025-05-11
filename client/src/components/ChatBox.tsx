import React, { useEffect, useRef } from 'react';
import './ChatBox.css';
import ToolCallParser from './ToolCallParser';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
  isError?: boolean;
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
            className={`message ${message.isBot ? 'bot' : 'user'} ${message.isError ? 'error' : ''}`}
          >
            <div className="message-content">
              {message.isBot ? (
                <div className={`message-text ${message.isError ? 'error-text' : ''}`}>
                  {message.isError ? (
                    <div className="error-message">
                      <svg className="w-6 h-6 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {message.text}
                    </div>
                  ) : (
                    <ToolCallParser text={message.text} />
                  )}
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