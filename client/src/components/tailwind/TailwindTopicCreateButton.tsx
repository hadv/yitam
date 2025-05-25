import React from 'react';

interface TopicCreateButtonProps {
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  iconOnly?: boolean;
}

const TailwindTopicCreateButton: React.FC<TopicCreateButtonProps> = ({
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  iconOnly = false
}) => {
  // Variant styles
  const variantStyles = {
    primary: 'bg-[#5D4A38] text-white hover:bg-[#4A3B2C]',
    secondary: 'bg-white text-[#5D4A38] border border-[#5D4A38] hover:bg-[#F2EEE5]',
    text: 'text-[#5D4A38] hover:bg-[#F2EEE5]'
  };

  // Size styles
  const sizeStyles = {
    sm: iconOnly ? 'p-1' : 'px-2 py-1 text-xs',
    md: iconOnly ? 'p-2' : 'px-3 py-2 text-sm',
    lg: iconOnly ? 'p-3' : 'px-4 py-2 text-base'
  };

  // Icon size based on button size
  const iconSize = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        ${variantStyles[variant]} 
        ${sizeStyles[size]} 
        rounded-md transition-colors duration-200 
        focus:outline-none focus:ring-2 focus:ring-[#5D4A38] focus:ring-opacity-50
        ${className}
      `}
    >
      <div className="flex items-center justify-center">
        <svg 
          className={`${iconSize[size]} ${!iconOnly ? 'mr-2' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth="2" 
            d="M12 4v16m8-8H4" 
          />
        </svg>
        {!iconOnly && <span>Tạo chủ đề mới</span>}
      </div>
    </button>
  );
};

export default TailwindTopicCreateButton; 