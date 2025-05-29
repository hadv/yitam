import React, { useState, useRef } from 'react';
import { exportUserData, importUserData } from '../../db/ChatHistoryDBUtil';
import db from '../../db/ChatHistoryDB';

interface TailwindDataExportImportProps {
  userId: string;
  currentTopicId?: number;
  onClose: () => void;
}

const TailwindDataExportImport: React.FC<TailwindDataExportImportProps> = ({
  userId,
  currentTopicId,
  onClose
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Function to export all user data
  const handleExportAllData = async () => {
    try {
      setIsExporting(true);
      setProgress(10);
      setErrorMessage(null);
      setSuccessMessage(null);

      // Get user data
      const userData = await exportUserData(userId);
      setProgress(50);

      // Create a download link
      const dataStr = JSON.stringify(userData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      // Create filename with date
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `yitam_export_${date}.json`;
      
      setProgress(80);
      
      // Create and click a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      setProgress(100);
      setSuccessMessage('Xuất dữ liệu thành công!');
      
      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
      }, 1500);
    } catch (error) {
      console.error('Export error:', error);
      setErrorMessage('Lỗi khi xuất dữ liệu. Vui lòng thử lại sau.');
      setIsExporting(false);
    }
  };

  // Function to export single topic data
  const handleExportCurrentTopic = async () => {
    if (!currentTopicId) {
      setErrorMessage('Không có cuộc trò chuyện nào được chọn.');
      return;
    }

    try {
      setIsExporting(true);
      setProgress(10);
      setErrorMessage(null);
      setSuccessMessage(null);

      // Get the current topic
      const topic = await db.topics.get(currentTopicId);
      if (!topic) {
        throw new Error('Không tìm thấy cuộc trò chuyện.');
      }
      
      setProgress(30);

      // Get all messages for this topic
      const messages = await db.messages
        .where('topicId')
        .equals(currentTopicId)
        .toArray();
      
      setProgress(60);

      // Create export data
      const exportData = {
        topics: [topic],
        messages: messages
      };

      // Create a download link
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      // Create filename with topic title and date
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const safeTitle = topic.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
      const filename = `yitam_${safeTitle}_${date}.json`;
      
      setProgress(90);
      
      // Create and click a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      setProgress(100);
      setSuccessMessage('Xuất cuộc trò chuyện thành công!');
      
      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
      }, 1500);
    } catch (error) {
      console.error('Export error:', error);
      setErrorMessage('Lỗi khi xuất cuộc trò chuyện. Vui lòng thử lại sau.');
      setIsExporting(false);
    }
  };

  // Function to import data
  const handleImportData = () => {
    fileInputRef.current?.click();
  };

  // Process the file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setProgress(10);
      setErrorMessage(null);
      setSuccessMessage(null);

      // Read the file
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          setProgress(30);
          const content = e.target?.result as string;
          
          // Validate JSON structure
          let data;
          try {
            data = JSON.parse(content);
          } catch (error) {
            throw new Error('Tệp không đúng định dạng JSON.');
          }
          
          // Validate data structure
          if (!data.topics || !Array.isArray(data.topics) || !data.messages || !Array.isArray(data.messages)) {
            throw new Error('Cấu trúc dữ liệu không hợp lệ.');
          }
          
          setProgress(50);
          
          // Import the data
          const success = await importUserData(data, userId);
          
          if (!success) {
            throw new Error('Không thể nhập dữ liệu. Vui lòng kiểm tra lại tệp.');
          }
          
          setProgress(90);
          
          // Trigger refresh of topic list
          if (window.triggerTopicListRefresh) {
            window.triggerTopicListRefresh();
          }
          
          setProgress(100);
          setSuccessMessage('Nhập dữ liệu thành công!');
          
          setTimeout(() => {
            setIsImporting(false);
            setProgress(0);
          }, 1500);
        } catch (error) {
          console.error('Import processing error:', error);
          setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi xử lý tệp nhập.');
          setIsImporting(false);
        }
      };
      
      reader.onerror = () => {
        setErrorMessage('Lỗi khi đọc tệp. Vui lòng thử lại.');
        setIsImporting(false);
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('Import error:', error);
      setErrorMessage('Lỗi khi nhập dữ liệu. Vui lòng thử lại sau.');
      setIsImporting(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-[#3A2E22] mb-6">
        Xuất / Nhập dữ liệu
      </h2>
      
      {/* Error message */}
      {errorMessage && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
          {errorMessage}
        </div>
      )}
      
      {/* Success message */}
      {successMessage && (
        <div className="mb-6 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md">
          {successMessage}
        </div>
      )}
      
      {/* Progress bar */}
      {(isExporting || isImporting) && (
        <div className="mb-6">
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#78A161] transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {isExporting ? 'Đang xuất dữ liệu...' : 'Đang nhập dữ liệu...'}
          </p>
        </div>
      )}
      
      {/* Export/Import options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#E6DFD1] rounded-lg p-4">
          <h3 className="text-lg font-medium text-[#3A2E22] mb-2">Xuất dữ liệu</h3>
          <p className="text-sm text-gray-600 mb-4">
            Xuất dữ liệu của bạn để sao lưu hoặc chuyển sang thiết bị khác.
          </p>
          <div className="flex flex-col space-y-2">
            <button
              onClick={handleExportAllData}
              disabled={isExporting || isImporting}
              className="w-full px-4 py-2 bg-[#78A161] text-white rounded-md hover:bg-[#6A8F54] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Xuất tất cả dữ liệu
            </button>
            <button
              onClick={handleExportCurrentTopic}
              disabled={isExporting || isImporting || !currentTopicId}
              className="w-full px-4 py-2 bg-white border border-[#78A161] text-[#78A161] rounded-md hover:bg-[#78A16115] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Xuất cuộc trò chuyện hiện tại
            </button>
          </div>
        </div>
        
        <div className="border border-[#E6DFD1] rounded-lg p-4">
          <h3 className="text-lg font-medium text-[#3A2E22] mb-2">Nhập dữ liệu</h3>
          <p className="text-sm text-gray-600 mb-4">
            Nhập dữ liệu từ tệp JSON đã xuất trước đó.
          </p>
          <button
            onClick={handleImportData}
            disabled={isExporting || isImporting}
            className="w-full px-4 py-2 bg-[#5D4A38] text-white rounded-md hover:bg-[#4A3A2A] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Chọn tệp để nhập
          </button>
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />
          <p className="text-xs text-gray-500 mt-2">
            Chỉ chấp nhận tệp JSON với định dạng phù hợp.
          </p>
        </div>
      </div>
      
      {/* Info section */}
      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <h4 className="text-sm font-medium text-blue-700 mb-1">Lưu ý</h4>
        <ul className="text-xs text-blue-600 list-disc pl-4 space-y-1">
          <li>Dữ liệu xuất bao gồm tất cả các cuộc trò chuyện và tin nhắn.</li>
          <li>Khi nhập dữ liệu, hệ thống sẽ thêm dữ liệu mới vào dữ liệu hiện có.</li>
          <li>Việc nhập dữ liệu không ảnh hưởng đến dữ liệu hiện có của bạn.</li>
          <li>Khuyến nghị sao lưu dữ liệu hiện có trước khi nhập dữ liệu mới.</li>
        </ul>
      </div>
    </div>
  );
};

export default TailwindDataExportImport; 