import React, { ReactNode } from 'react';

interface TailwindModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  fullHeight?: boolean;
}

const TailwindModal: React.FC<TailwindModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-xl',
  fullHeight = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`relative w-full ${maxWidth} bg-white rounded-lg shadow-xl animate-fade-in ${fullHeight ? 'h-[80vh] flex flex-col' : ''}`}>
        {title && (
          <div className="flex justify-between items-center p-6 border-b border-[#E6DFD1]">
            <h2 className="text-2xl font-semibold text-[#3A2E22]">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {!title && (
          <button
            onClick={onClose}
            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        <div className={fullHeight ? 'flex-1 overflow-auto' : ''}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default TailwindModal; 