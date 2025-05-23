import React, { useEffect, useRef, useState } from 'react';
import './ChatBox.css';
import ToolCallParser from './ToolCallParser';
import db, { Topic } from '../db/ChatHistoryDB';

interface Message {
  id: number;
  text: string;
  isBot: boolean;
  isStreaming?: boolean;
  isError?: boolean;
  role?: 'user' | 'assistant';
  tokens?: number;
}

interface ChatBoxProps {
  messages: Message[];
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  const handleDeleteMessage = (id: number) => {
    setShowDeleteModal(id);
  };

  const confirmDeleteMessage = async () => {
    if (!showDeleteModal) return;
    try {
      const message = await db.messages.get(showDeleteModal);
      await db.messages.delete(showDeleteModal);
      setLocalMessages(prev => prev.filter(m => m.id !== showDeleteModal));

      if (message) {
        const topic = await db.topics.get(message.topicId);
        if (topic) {
          const updateData: Partial<Topic> = {
            messageCnt: Math.max(0, (topic.messageCnt || 0) - 1)
          };

          if (message.role === 'user') {
            updateData.userMessageCnt = Math.max(0, (topic.userMessageCnt || 0) - 1);
          } else {
            updateData.assistantMessageCnt = Math.max(0, (topic.assistantMessageCnt || 0) - 1);
          }

          if (message.tokens) {
            updateData.totalTokens = Math.max(0, (topic.totalTokens || 0) - message.tokens);
          }

          await db.topics.update(message.topicId, updateData);
        }
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
    setShowDeleteModal(null);
  };

  const cancelDeleteMessage = () => {
    setShowDeleteModal(null);
  };

  return (
    <div className="chat-box">
      {localMessages.length === 0 ? (
        <div className="empty-chat">Xin chào! Yitam đang lắng nghe!</div>
      ) : (
        localMessages.map((message) => (
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
            {message.id !== undefined && (
              <button className="delete-btn" onClick={() => handleDeleteMessage(message.id)}>
                &times;
              </button>
            )}
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
      {showDeleteModal && (
        <div className="delete-modal-overlay">
          <div className="delete-modal">
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc chắn muốn xóa tin nhắn này? Hành động này không thể hoàn tác.</p>
            <div className="delete-modal-actions">
              <button onClick={cancelDeleteMessage}>Hủy</button>
              <button onClick={confirmDeleteMessage}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatBox; 
