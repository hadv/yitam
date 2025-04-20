import React, { useEffect, useRef } from 'react';
import TailwindToolCallParser from './TailwindToolCallParser';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
}

interface ChatBoxProps {
  messages: Message[];
}

const TailwindChatBox: React.FC<ChatBoxProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-[#3A2E22] opacity-60 text-[1.1rem]">
          Xin chào! Yitam đang lắng nghe!
        </div>
      ) : (
        messages.map((message) => (
          <div 
            key={message.id} 
            className={`mb-3 max-w-[80%] ${
              message.isBot ? 'self-start' : 'self-end'
            }`}
            style={{
              animation: 'fadeIn 0.3s ease-in-out'
            }}
          >
            <div 
              className={`p-[10px_14px] rounded-[8px] text-[0.95rem] leading-[1.5] ${
                message.isBot 
                  ? 'bg-[#F2EEE5] text-[#3A2E22] rounded-[0_8px_8px_8px]' 
                  : 'bg-[#5D4A38] text-white rounded-[8px_8px_0_8px]'
              }`}
            >
              {message.isBot ? (
                <div className="prose prose-sm max-w-none prose-headings:my-2 prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-ul:pl-6 prose-ol:my-2 prose-ol:pl-6 prose-li:my-1 prose-code:bg-[rgba(93,74,56,0.1)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-pre:bg-[rgba(93,74,56,0.1)] prose-pre:p-4 prose-pre:rounded-lg prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:code:bg-transparent prose-pre:code:p-0">
                  <TailwindToolCallParser text={message.text} />
                  {message.isStreaming && (
                    <span className="inline-flex items-center ml-1.5">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </span>
                  )}
                </div>
              ) : (
                <span>{message.text}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 ml-2 mt-1">
              {message.isBot ? 'Yitam' : 'Bạn'}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />

      <style>
        {`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .typing-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          margin: 0 2px;
          background-color: #777;
          border-radius: 50%;
          animation: typing-animation 1.4s infinite ease-in-out both;
        }
        
        .typing-dot:nth-child(1) {
          animation-delay: 0s;
        }
        
        .typing-dot:nth-child(2) {
          animation-delay: 0.2s;
        }
        
        .typing-dot:nth-child(3) {
          animation-delay: 0.4s;
        }
        
        @keyframes typing-animation {
          0%, 80%, 100% { 
            transform: scale(0.6);
            opacity: 0.6;
          }
          40% { 
            transform: scale(1);
            opacity: 1;
          }
        }
        `}
      </style>
    </div>
  );
};

export default TailwindChatBox; 