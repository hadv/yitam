import React, { ReactNode, useEffect } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  fullHeight?: boolean;
  scrollable?: boolean;
  showCloseButton?: boolean;
  closeOnEsc?: boolean;
  closeOnBackdropClick?: boolean;
  className?: string;
  containerClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  animation?: 'fade' | 'slide' | 'scale' | 'none';
  position?: 'center' | 'top' | 'bottom';
  hideBackdrop?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-xl',
  fullHeight = false,
  scrollable = true,
  showCloseButton = true,
  closeOnEsc = true,
  closeOnBackdropClick = true,
  className = '',
  containerClassName = '',
  headerClassName = '',
  bodyClassName = '',
  animation = 'fade',
  position = 'center',
  hideBackdrop = false,
}) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (isOpen && closeOnEsc && e.key === 'Escape') {
        onClose();
      }
    };

    if (closeOnEsc) {
      window.addEventListener('keydown', handleEsc);
    }
    
    // Prevent body scrolling when modal is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  // Determine animation classes
  const animationClasses = {
    fade: 'animate-fade-in',
    slide: 'animate-slide-in-bottom',
    scale: 'animate-scale-in',
    none: '',
  }[animation];

  // Determine position classes
  const positionClasses = {
    center: 'items-center',
    top: 'items-start pt-20',
    bottom: 'items-end pb-20',
  }[position];

  return (
    <div 
      className={`fixed inset-0 z-50 flex justify-center ${positionClasses} p-4 ${!hideBackdrop ? 'bg-black/50 backdrop-blur-sm' : ''}`}
      onClick={closeOnBackdropClick ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div 
        className={`relative w-full ${maxWidth} bg-white rounded-lg shadow-xl ${animationClasses} ${
          fullHeight ? 'h-[80vh] flex flex-col' : 'max-h-[90vh] flex flex-col'
        } ${containerClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className={`flex justify-between items-center p-4 sm:p-6 border-b border-[#E6DFD1] flex-shrink-0 ${headerClassName}`}>
            <h2 id="modal-title" className="text-xl sm:text-2xl font-semibold text-[#3A2E22]">{title}</h2>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#78A161] rounded-full p-1"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        
        {!title && showCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#78A161] rounded-full p-1 z-10"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        <div className={`${fullHeight || scrollable ? 'flex-1 overflow-y-auto' : ''} ${scrollable ? 'overscroll-contain' : ''} ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal; 