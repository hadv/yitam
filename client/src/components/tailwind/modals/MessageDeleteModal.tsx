import React from 'react';

interface MessageDeleteModalProps {
  messageId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const MessageDeleteModal: React.FC<MessageDeleteModalProps> = ({
  messageId,
  onConfirm,
  onCancel
}) => {
  if (!messageId) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full">
        <h3 className="text-lg font-medium text-[#3A2E22] mb-4">Xác nhận xóa</h3>
        <p className="text-gray-600 mb-6">
          Bạn có chắc chắn muốn xóa tin nhắn này? Hành động này không thể hoàn tác.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-[#3A2E22] hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageDeleteModal; 