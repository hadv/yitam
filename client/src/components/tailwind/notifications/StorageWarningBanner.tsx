import React from 'react';
import { StorageUsage } from '../../../hooks/useStorageSettings';

interface StorageWarningBannerProps {
  storageUsage: StorageUsage | null;
  onOpenStorageSettings: () => void;
}

const StorageWarningBanner: React.FC<StorageWarningBannerProps> = ({ 
  storageUsage, 
  onOpenStorageSettings 
}) => {
  if (!storageUsage || storageUsage.percentage <= 80) return null;
  
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">Cảnh báo dung lượng lưu trữ</h3>
          <div className="mt-1 text-sm text-red-700">
            Dung lượng lưu trữ gần đầy ({storageUsage.percentage.toFixed(1)}%). Hãy dọn dẹp cuộc trò chuyện cũ để tránh mất dữ liệu.
          </div>
          <div className="mt-2">
            <button 
              type="button" 
              className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none"
              onClick={onOpenStorageSettings}
            >
              Quản lý dung lượng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StorageWarningBanner; 