import React from 'react';

interface BetaBannerProps {
  message?: string;
}

export const BetaBanner: React.FC<BetaBannerProps> = ({ 
  message = "Đây là phiên bản beta của chatbot. Các tính năng và phản hồi có thể bị giới hạn hoặc đang trong giai đoạn thử nghiệm."
}) => {
  return (
    <div className="bg-yellow-50 text-yellow-800 p-3 text-center text-sm rounded-md my-4 mx-2 border border-yellow-200">
      ⚠️ {message}
    </div>
  );
};

interface ApiKeyWarningProps {
  onSetup: () => void;
}

export const ApiKeyWarning: React.FC<ApiKeyWarningProps> = ({ onSetup }) => {
  return (
    <div className="bg-red-50 text-red-800 p-4 text-center rounded-md my-4 mx-2 border border-red-200 flex flex-col items-center">
      <div className="flex items-center mb-2">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="font-medium">Chưa cấu hình API Key</span>
      </div>
      <p className="text-sm mb-3">
        Bạn cần cấu hình Anthropic API Key để bắt đầu sử dụng ứng dụng. API Key được sử dụng để kết nối với Claude AI.
      </p>
      <button
        onClick={onSetup}
        className="bg-red-100 hover:bg-red-200 text-red-800 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Cấu hình API Key
      </button>
    </div>
  );
}; 