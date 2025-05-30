import React, { useState } from 'react';
import { useStorageSettings, StorageUsage } from '../../../hooks/useStorageSettings';

interface TailwindStorageSettingsProps {
  userId: string;
  onClose: () => void;
}

const TailwindStorageSettings: React.FC<TailwindStorageSettingsProps> = ({
  userId,
  onClose
}) => {
  const {
    settings,
    storageUsage,
    cleanupState,
    actions
  } = useStorageSettings(userId);

  const [keepCount, setKeepCount] = useState(50);
  
  return (
    <div className="p-6">
      <h3 className="text-lg font-medium text-[#3A2E22] mb-4">Cài đặt lưu trữ</h3>
      
      {/* Storage Usage Visualization */}
      {storageUsage && storageUsage.percentage > 0 && (
        <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#5D4A38]">
              Dung lượng lưu trữ: {(storageUsage.usage / (1024 * 1024)).toFixed(1)} MB / {(storageUsage.quota / (1024 * 1024)).toFixed(1)} MB
            </span>
            <span className={`text-sm font-medium ${
              storageUsage.percentage > 80 ? 'text-red-600' : 
              storageUsage.percentage > 60 ? 'text-amber-600' : 'text-[#78A161]'
            }`}>
              {storageUsage.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full ${
                storageUsage.percentage > 80 ? 'bg-red-500' : 
                storageUsage.percentage > 60 ? 'bg-amber-500' : 'bg-[#78A161]'
              }`}
              style={{ width: `${Math.min(100, storageUsage.percentage)}%` }}
            ></div>
          </div>
          
          {/* Warning message for high storage usage */}
          {storageUsage.percentage > 80 && (
            <div className="mt-2 text-sm text-red-600">
              <strong>Cảnh báo:</strong> Dung lượng lưu trữ gần đầy. Hãy xóa bớt cuộc trò chuyện cũ hoặc bật tính năng tự động dọn dẹp.
            </div>
          )}
        </div>
      )}
      
      {/* Retention Policy Settings */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[#3A2E22] mb-2">
          Chính sách lưu trữ (ngày)
        </label>
        <div className="flex items-center space-x-3">
          <input
            type="range"
            min="7"
            max="365"
            step="1"
            value={settings.retentionPolicyDays}
            onChange={(e) => settings.setRetentionPolicyDays(parseInt(e.target.value))}
            className="w-full"
          />
          <span className="w-12 text-center">{settings.retentionPolicyDays}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Cuộc trò chuyện cũ hơn {settings.retentionPolicyDays} ngày sẽ được xóa tự động nếu bật tính năng tự động dọn dẹp.
        </p>
      </div>
      
      {/* Auto Cleanup Toggle */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[#3A2E22]">
            Tự động dọn dẹp cuộc trò chuyện cũ
          </label>
          <div className="relative inline-block w-10 mr-2 align-middle select-none">
            <input
              type="checkbox"
              name="auto-cleanup"
              id="auto-cleanup"
              checked={settings.autoCleanupEnabled}
              onChange={(e) => settings.setAutoCleanupEnabled(e.target.checked)}
              className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
            />
            <label
              htmlFor="auto-cleanup"
              className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                settings.autoCleanupEnabled ? 'bg-[#78A161]' : 'bg-gray-300'
              }`}
            ></label>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Khi bật, hệ thống sẽ tự động xóa cuộc trò chuyện cũ hơn {settings.retentionPolicyDays} ngày.
        </p>
      </div>
      
      {/* Message Compression Toggle */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[#3A2E22]">
            Nén tin nhắn dài
          </label>
          <div className="relative inline-block w-10 mr-2 align-middle select-none">
            <input
              type="checkbox"
              name="message-compression"
              id="message-compression"
              checked={settings.messageCompressionEnabled}
              onChange={(e) => settings.setMessageCompressionEnabled(e.target.checked)}
              className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
            />
            <label
              htmlFor="message-compression"
              className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                settings.messageCompressionEnabled ? 'bg-[#78A161]' : 'bg-gray-300'
              }`}
            ></label>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Tin nhắn dài sẽ được nén để tiết kiệm dung lượng lưu trữ.
        </p>
      </div>
      
      {/* Message Paging Size */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[#3A2E22] mb-2">
          Số tin nhắn hiển thị mỗi trang
        </label>
        <div className="flex items-center space-x-3">
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={settings.messagePageSize}
            onChange={(e) => settings.setMessagePageSize(parseInt(e.target.value))}
            className="w-full"
          />
          <span className="w-12 text-center">{settings.messagePageSize}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Hiển thị ít tin nhắn hơn có thể cải thiện hiệu suất cho cuộc trò chuyện dài.
        </p>
      </div>
      
      {/* Manual Cleanup */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
        <h4 className="text-md font-medium text-[#3A2E22] mb-2">Dọn dẹp thủ công</h4>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#3A2E22] mb-2">
            Giữ lại số cuộc trò chuyện gần nhất
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="range"
              min="5"
              max="200"
              step="5"
              value={keepCount}
              onChange={(e) => setKeepCount(parseInt(e.target.value))}
              className="w-full"
            />
            <span className="w-12 text-center">{keepCount}</span>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={() => actions.cleanupOldestConversations(keepCount)}
            disabled={cleanupState.isRunningCleanup}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
          >
            {cleanupState.isRunningCleanup ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : 'Xóa cuộc trò chuyện cũ'}
          </button>
          
          <button
            onClick={() => actions.compressMessages()}
            disabled={cleanupState.isRunningCleanup}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {cleanupState.isRunningCleanup ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : 'Nén tin nhắn'}
          </button>
          
          <button
            onClick={actions.analyzeStorage}
            disabled={cleanupState.isRunningCleanup}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {cleanupState.isRunningCleanup ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : 'Phân tích dung lượng'}
          </button>
        </div>
        
        {/* Error message */}
        {cleanupState.errorMessage && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <strong>Lỗi:</strong> {cleanupState.errorMessage}
          </div>
        )}
        
        {/* Result display */}
        {cleanupState.cleanupResult && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
            <div className="font-medium text-green-800 mb-1">Thao tác thành công!</div>
            
            {/* Different result displays based on operation type */}
            {cleanupState.cleanupResult.type === 'analysis' ? (
              <div className="space-y-2">
                <h4 className="font-medium text-green-800">Kết quả phân tích dung lượng:</h4>
                
                {cleanupState.cleanupResult.counts && (
                  <div className="ml-2">
                    <div className="text-green-700">Số lượng đề mục: {cleanupState.cleanupResult.counts.topics}</div>
                    <div className="text-green-700">Số lượng tin nhắn: {cleanupState.cleanupResult.counts.messages}</div>
                    <div className="text-green-700">Số lượng chỉ mục từ: {cleanupState.cleanupResult.counts.wordIndices}</div>
                    {cleanupState.cleanupResult.counts.orphanedMessages && cleanupState.cleanupResult.counts.orphanedMessages > 0 && (
                      <div className="text-amber-600">
                        Phát hiện {cleanupState.cleanupResult.counts.orphanedMessages} tin nhắn không thuộc về đề mục nào!
                      </div>
                    )}
                  </div>
                )}
                
                {cleanupState.cleanupResult.storageEstimate && (
                  <div className="ml-2">
                    <div className="text-green-700">
                      Dung lượng sử dụng: {(cleanupState.cleanupResult.storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB
                    </div>
                    <div className="text-green-700">
                      Tỷ lệ sử dụng: {cleanupState.cleanupResult.storageEstimate.percentage.toFixed(1)}%
                    </div>
                  </div>
                )}
                
                {cleanupState.cleanupResult.recommendedAction && (
                  <div className={`ml-2 ${cleanupState.cleanupResult.counts?.orphanedMessages && cleanupState.cleanupResult.counts.orphanedMessages > 0 ? 'text-amber-600' : 'text-green-700'}`}>
                    <strong>Đề xuất:</strong> {cleanupState.cleanupResult.recommendedAction === "No issues detected" ? "Không phát hiện vấn đề" : cleanupState.cleanupResult.recommendedAction}
                    
                    {/* Show cleanup button if orphaned messages are detected */}
                    {cleanupState.cleanupResult.counts?.orphanedMessages && cleanupState.cleanupResult.counts.orphanedMessages > 0 && (
                      <button
                        onClick={actions.cleanupOrphanedData}
                        disabled={cleanupState.isRunningCleanup}
                        className="ml-3 px-3 py-1 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 disabled:opacity-50"
                      >
                        {cleanupState.isRunningCleanup ? 'Đang xử lý...' : 'Dọn dẹp dữ liệu ngay'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : cleanupState.cleanupResult.type === 'orphaned-cleanup' ? (
              <div className="space-y-2">
                <h4 className="font-medium text-green-800">Kết quả dọn dẹp dữ liệu:</h4>
                
                {cleanupState.cleanupResult.cleanupResult && (
                  <div className="ml-2">
                    <div className="text-green-700">
                      Đã xóa {cleanupState.cleanupResult.cleanupResult.deletedMessages || 0} tin nhắn mồ côi
                    </div>
                    <div className="text-green-700">
                      Đã xóa {cleanupState.cleanupResult.cleanupResult.deletedTopics || 0} đề mục trống
                    </div>
                    {cleanupState.cleanupResult.cleanupResult.deletedWordIndices > 0 && (
                      <div className="text-green-700">
                        Đã xóa {cleanupState.cleanupResult.cleanupResult.deletedWordIndices} chỉ mục từ mồ côi
                      </div>
                    )}
                  </div>
                )}
                
                {/* Show updated analysis results if available */}
                {cleanupState.cleanupResult.analysisResult && cleanupState.cleanupResult.analysisResult.counts && (
                  <div className="mt-4">
                    <h5 className="font-medium text-green-800">Kết quả phân tích sau khi dọn dẹp:</h5>
                    <div className="ml-2">
                      <div className="text-green-700">Số lượng đề mục: {cleanupState.cleanupResult.analysisResult.counts.topics}</div>
                      <div className="text-green-700">Số lượng tin nhắn: {cleanupState.cleanupResult.analysisResult.counts.messages}</div>
                      <div className="text-green-700">Số lượng chỉ mục từ: {cleanupState.cleanupResult.analysisResult.counts.wordIndices}</div>
                      {cleanupState.cleanupResult.analysisResult.counts.orphanedMessages > 0 ? (
                        <div className="text-amber-600">
                          Vẫn còn {cleanupState.cleanupResult.analysisResult.counts.orphanedMessages} tin nhắn không thuộc về đề mục nào!
                          <button
                            onClick={actions.cleanupOrphanedData}
                            disabled={cleanupState.isRunningCleanup}
                            className="ml-3 px-3 py-1 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 disabled:opacity-50"
                          >
                            {cleanupState.isRunningCleanup ? 'Đang xử lý...' : 'Thử dọn dẹp lại'}
                          </button>
                        </div>
                      ) : (
                        <div className="text-green-700">Không còn tin nhắn mồ côi!</div>
                      )}
                    </div>
                    
                    {cleanupState.cleanupResult.analysisResult.storageEstimate && (
                      <div className="ml-2 mt-2">
                        <div className="text-green-700">
                          Dung lượng sử dụng hiện tại: {(cleanupState.cleanupResult.analysisResult.storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : cleanupState.cleanupResult.deletedCount !== undefined ? (
              <div className="text-green-700">Đã xóa {cleanupState.cleanupResult.deletedCount} cuộc trò chuyện.</div>
            ) : cleanupState.cleanupResult.compressedCount !== undefined ? (
              <div>
                <div className="text-green-700">Đã nén {cleanupState.cleanupResult.compressedCount} tin nhắn.</div>
                {cleanupState.cleanupResult.savingsPercentage !== undefined && (
                  <div className="text-green-700">Tiết kiệm {cleanupState.cleanupResult.savingsPercentage.toFixed(1)}% dung lượng.</div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
      
      {/* CSS for toggle switch */}
      <style>{`
        .toggle-checkbox:checked {
          right: 0;
          border-color: #78A161;
        }
        .toggle-checkbox:checked + .toggle-label {
          background-color: #78A161;
        }
        .toggle-checkbox {
          right: 0;
          border-color: #ccc;
          transition: all 0.3s;
        }
        .toggle-label {
          transition: all 0.3s;
        }
      `}</style>
      
      {/* Close button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-[#3A2E22] text-white rounded-md hover:bg-[#2A1E12]"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};

export default TailwindStorageSettings; 