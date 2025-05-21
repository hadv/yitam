import React, { useState, useEffect } from 'react';
import db, { Topic } from '../../db/ChatHistoryDB';

interface TopicEditorProps {
  userId: string;
  topicToEdit?: Topic;
  onSave: (topic: Topic) => void;
  onCancel: () => void;
  isOpen: boolean;
}

const TailwindTopicEditor: React.FC<TopicEditorProps> = ({
  userId,
  topicToEdit,
  onSave,
  onCancel,
  isOpen
}) => {
  const [title, setTitle] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [model, setModel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (topicToEdit) {
      setTitle(topicToEdit.title);
      setSystemPrompt(topicToEdit.systemPrompt || '');
      setIsPinned(topicToEdit.pinnedState || false);
      setModel(topicToEdit.model || '');
    } else {
      // Default values for new topic
      setTitle('');
      setSystemPrompt('');
      setIsPinned(false);
      setModel('');
    }
    // Clear any previous errors
    setError('');
  }, [topicToEdit, isOpen]);

  const handleSave = async () => {
    // Validate form
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề cho chủ đề');
      return;
    }

    try {
      const now = Date.now();
      
      // Prepare topic object
      const topicData: Topic = topicToEdit 
        ? {
            ...topicToEdit,
            title: title.trim(),
            systemPrompt: systemPrompt.trim() || undefined,
            pinnedState: isPinned,
            model: model || undefined,
            lastActive: now
          }
        : {
            userId,
            title: title.trim(),
            createdAt: now,
            lastActive: now,
            systemPrompt: systemPrompt.trim() || undefined,
            pinnedState: isPinned,
            model: model || undefined,
            messageCnt: 0,
            userMessageCnt: 0,
            assistantMessageCnt: 0,
            totalTokens: 0
          };
      
      onSave(topicData);
    } catch (error) {
      console.error('Error saving topic:', error);
      setError('Đã xảy ra lỗi khi lưu chủ đề. Vui lòng thử lại.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-[#3A2E22] mb-4">
          {topicToEdit ? 'Chỉnh sửa chủ đề' : 'Tạo chủ đề mới'}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-[#3A2E22] mb-1">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5D4A38]"
              placeholder="Nhập tiêu đề chủ đề"
            />
          </div>
          
          <div>
            <label htmlFor="systemPrompt" className="block text-sm font-medium text-[#3A2E22] mb-1">
              Hướng dẫn hệ thống
            </label>
            <textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5D4A38]"
              placeholder="Nhập hướng dẫn hệ thống (tùy chọn)"
            />
            <p className="mt-1 text-xs text-gray-500">
              Hướng dẫn này sẽ được gửi đến AI ở đầu cuộc trò chuyện
            </p>
          </div>
          
          <div>
            <label htmlFor="model" className="block text-sm font-medium text-[#3A2E22] mb-1">
              Model
            </label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5D4A38]"
            >
              <option value="">Mặc định</option>
              <option value="claude-3-opus-20240229">Claude 3 Opus</option>
              <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
              <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
            </select>
          </div>
          
          <div className="flex items-center">
            <input
              id="pinned"
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4 text-[#5D4A38] focus:ring-[#5D4A38] border-gray-300 rounded"
            />
            <label htmlFor="pinned" className="ml-2 block text-sm text-[#3A2E22]">
              Ghim chủ đề này
            </label>
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-[#3A2E22] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#5D4A38]"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-[#5D4A38] text-white rounded-md hover:bg-[#4A3B2C] focus:outline-none focus:ring-2 focus:ring-[#5D4A38] focus:ring-opacity-50"
            >
              {topicToEdit ? 'Lưu thay đổi' : 'Tạo chủ đề'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TailwindTopicEditor; 