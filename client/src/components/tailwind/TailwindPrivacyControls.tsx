import React, { useState } from 'react';
import { clearUserData } from '../../db/ChatHistoryDBUtil';

interface TailwindPrivacyControlsProps {
  userId: string;
  onDataDeleted: () => void;
}

const TailwindPrivacyControls: React.FC<TailwindPrivacyControlsProps> = ({
  userId,
  onDataDeleted
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle data deletion request
  const handleDeleteAllData = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      setIsDeleting(true);
      setErrorMessage(null);
      setDeleteSuccess(false);

      // Call the clearUserData function from ChatHistoryDBUtil
      const success = await clearUserData(userId);

      if (success) {
        setDeleteSuccess(true);
        setConfirmDelete(false);
        
        // Notify parent component
        onDataDeleted();
      } else {
        throw new Error('Không thể xóa dữ liệu. Vui lòng thử lại sau.');
      }
    } catch (error) {
      console.error('Error deleting user data:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Đã xảy ra lỗi khi xóa dữ liệu.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Cancel delete request
  const handleCancelDelete = () => {
    setConfirmDelete(false);
    setErrorMessage(null);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h3 className="text-lg font-medium text-[#3A2E22] mb-4">Quyền riêng tư &amp; Kiểm soát dữ liệu</h3>

      {/* GDPR Information */}
      <div className="mb-6">
        <h4 className="text-md font-medium text-[#3A2E22] mb-2">Dữ liệu của bạn</h4>
        <p className="text-sm text-gray-600 mb-4">
          Phù hợp với quy định GDPR, bạn có quyền:
        </p>
        <ul className="text-sm text-gray-600 list-disc pl-5 space-y-2 mb-4">
          <li>Truy cập vào dữ liệu của bạn (xuất dữ liệu)</li>
          <li>Xóa toàn bộ dữ liệu của bạn</li>
          <li>Yêu cầu sửa đổi thông tin của bạn</li>
        </ul>
        <p className="text-sm text-gray-600">
          Mọi dữ liệu của bạn được lưu trữ cục bộ trên trình duyệt này và chỉ bạn mới có thể truy cập.
        </p>
      </div>

      {/* Data Deletion Controls */}
      <div className="p-4 border border-[#E6DFD1] rounded-lg mb-6">
        <h4 className="text-md font-medium text-[#3A2E22] mb-2">Xóa dữ liệu</h4>
        <p className="text-sm text-gray-600 mb-4">
          Xóa tất cả dữ liệu cuộc trò chuyện của bạn. Hành động này không thể hoàn tác.
        </p>

        {/* Success message */}
        {deleteSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md">
            Tất cả dữ liệu của bạn đã được xóa thành công.
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
            {errorMessage}
          </div>
        )}

        {/* Confirmation UI */}
        {confirmDelete ? (
          <div className="border border-red-200 rounded-md p-4 bg-red-50">
            <p className="text-sm text-red-700 font-medium mb-4">
              Bạn có chắc chắn muốn xóa tất cả dữ liệu của mình? Hành động này không thể hoàn tác.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleDeleteAllData}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang xử lý...
                  </span>
                ) : 'Xác nhận xóa tất cả'}
              </button>
              <button
                onClick={handleCancelDelete}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleDeleteAllData}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Xóa tất cả dữ liệu của tôi
          </button>
        )}
      </div>

      {/* Privacy Policy Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <h4 className="text-sm font-medium text-blue-700 mb-2">Thông tin về lưu trữ dữ liệu</h4>
        <ul className="text-xs text-blue-600 list-disc pl-4 space-y-1">
          <li>Dữ liệu của bạn được lưu trữ cục bộ trên trình duyệt này.</li>
          <li>Chúng tôi không lưu trữ nội dung cuộc trò chuyện của bạn trên máy chủ.</li>
          <li>Nội dung cuộc trò chuyện sẽ được xử lý bởi máy chủ AI khi bạn gửi tin nhắn.</li>
          <li>Tin nhắn được xử lý theo chính sách quyền riêng tư của nhà cung cấp API.</li>
          <li>Chúng tôi không chia sẻ dữ liệu của bạn với bên thứ ba.</li>
        </ul>
      </div>
    </div>
  );
};

export default TailwindPrivacyControls; 