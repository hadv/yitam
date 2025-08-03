import React, { useState } from 'react';
import { UserData } from '../../types/chat';

interface TailwindUserProfileProps {
  user: UserData;
  onLogout: () => void;
  onOpenTopicManager: () => void;
  onOpenApiSettings: () => void;
  onOpenDataExportImport: () => void;
  onOpenStorageSettings?: () => void;
  onOpenPrivacyControls?: () => void;
  onOpenPrivacyPolicy?: () => void;
}

const TailwindUserProfile: React.FC<TailwindUserProfileProps> = ({
  user,
  onLogout,
  onOpenTopicManager,
  onOpenApiSettings,
  onOpenDataExportImport,
  onOpenStorageSettings,
  onOpenPrivacyControls,
  onOpenPrivacyPolicy
}) => {
  const [imageError, setImageError] = useState(false);
  
  if (!user) return null;

  // Get first letter of name for fallback avatar
  const getInitial = () => {
    return user.name && user.name.length > 0 
      ? user.name.charAt(0).toUpperCase() 
      : 'U';
  };

  return (
    <div className="relative group">
      <button className="flex items-center space-x-2 p-2 rounded-lg hover:bg-[#78A16115] transition-all">
        {imageError || !user.picture ? (
          <div 
            className="w-9 h-9 rounded-full border-2 border-[#78A161] group-hover:border-[#5D4A38] transition-colors flex items-center justify-center bg-[#5D4A38] text-white font-semibold"
          >
            {getInitial()}
          </div>
        ) : (
          <img
            src={user.picture}
            alt={user.name}
            className="w-9 h-9 rounded-full border-2 border-[#78A161] group-hover:border-[#5D4A38] transition-colors"
            onError={() => setImageError(true)}
          />
        )}
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-[#5D4A38] line-clamp-1">{user.name}</p>
          <p className="text-xs text-[#5D4A38] opacity-70">Đã xác thực</p>
        </div>
        <svg className="w-4 h-4 text-[#78A161] group-hover:text-[#5D4A38] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div className="absolute right-0 top-full mt-1 w-64 py-1 bg-white rounded-lg shadow-lg border border-[#E6DFD1] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
        <button
          onClick={onOpenTopicManager}
          className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
        >
          <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Quản lý cuộc trò chuyện
        </button>
        <button
          onClick={onOpenDataExportImport}
          className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
        >
          <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Xuất/nhập dữ liệu
        </button>
        {onOpenStorageSettings && (
          <button
            onClick={onOpenStorageSettings}
            className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
          >
            <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            Quản lý dung lượng lưu trữ
          </button>
        )}
        {onOpenPrivacyControls && (
          <button
            onClick={onOpenPrivacyControls}
            className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
          >
            <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Quyền riêng tư &amp; GDPR
          </button>
        )}
        {onOpenPrivacyPolicy && (
          <button
            onClick={onOpenPrivacyPolicy}
            className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
          >
            <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Chính sách quyền riêng tư
          </button>
        )}
        <button
          onClick={onOpenApiSettings}
          className="w-full flex items-center px-4 py-2 text-sm text-[#5D4A38] hover:bg-[#78A16115] transition-colors"
        >
          <svg className="w-4 h-4 mr-2 text-[#78A161]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Cài đặt API Key
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center px-4 py-2 text-sm text-[#BC4749] hover:bg-[#BC474915] transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Đăng xuất
        </button>
      </div>
    </div>
  );
};

export default TailwindUserProfile; 