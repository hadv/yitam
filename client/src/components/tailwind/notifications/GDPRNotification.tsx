import React from 'react';

interface GDPRNotificationProps {
  show: boolean;
  onClose: () => void;
}

const GDPRNotification: React.FC<GDPRNotificationProps> = ({ show, onClose }) => {
  if (!show) return null;
  
  return (
    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md animate-fade-in-out flex items-center justify-between">
      <div className="flex items-center">
        <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-green-700">Dữ liệu của bạn đã được xóa thành công theo yêu cầu GDPR.</span>
      </div>
      <button 
        onClick={onClose}
        className="text-green-500 hover:text-green-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default GDPRNotification; 