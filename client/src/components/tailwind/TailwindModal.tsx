import React, { ReactNode } from 'react';

interface TailwindModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  fullHeight?: boolean;
  scrollable?: boolean;
}

const TailwindModal: React.FC<TailwindModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-xl',
  fullHeight = false,
  scrollable = true
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className={`relative w-full ${maxWidth} bg-white rounded-lg shadow-xl animate-fade-in ${
          fullHeight ? 'h-[80vh] flex flex-col' : 'max-h-[90vh] flex flex-col'
        }`}
      >
        {title && (
          <div className="flex justify-between items-center p-4 sm:p-6 border-b border-[#E6DFD1] flex-shrink-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#3A2E22]">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Close"
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
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        <div className={`${fullHeight || scrollable ? 'flex-1 overflow-y-auto' : ''} ${scrollable ? 'overscroll-contain' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default TailwindModal; 