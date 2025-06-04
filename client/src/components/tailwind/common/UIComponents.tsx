import React from 'react';
import type { Components } from 'react-markdown';

// Common button component with different variants
interface ButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export const Button: React.FC<ButtonProps> = ({ 
  onClick, 
  disabled = false, 
  children, 
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button'
}) => {
  const baseClasses = "rounded-[8px] font-medium transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed";
  
  const variantClasses = {
    primary: "bg-[#5D4A38] text-white hover:enabled:bg-[#78A161] disabled:bg-[#E6DFD1] disabled:text-[#3A2E22] disabled:opacity-50",
    secondary: "bg-[#F2EEE5] text-[#3A2E22] hover:enabled:bg-[#E6DFD1] disabled:opacity-50",
    danger: "bg-red-600 text-white hover:enabled:bg-red-700 disabled:bg-red-200"
  };
  
  const sizeClasses = {
    sm: "py-1.5 px-3 text-sm",
    md: "py-2.5 px-5 text-base",
    lg: "py-3 px-6 text-lg"
  };
  
  return (
    <button 
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
};

// Common input component
interface InputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  type?: string;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  className = '',
  type = 'text'
}) => {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`p-[10px_14px] border border-[#E6DFD1] rounded-[8px] text-base outline-none transition-colors duration-200 focus:border-[#5D4A38] disabled:bg-[#E6DFD1] disabled:cursor-not-allowed ${className}`}
    />
  );
};

// Empty state component
interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  icon,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center h-[200px] text-[#3A2E22] opacity-60 text-[1.1rem] ${className}`}>
      {icon && <div className="mb-3">{icon}</div>}
      {message}
    </div>
  );
};

// Card component for consistent container styling
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] ${className}`}>
      {children}
    </div>
  );
};

// Expandable panel component
interface ExpandablePanelProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  initialExpanded?: boolean;
  className?: string;
}

export const ExpandablePanel: React.FC<ExpandablePanelProps> = ({
  title,
  children,
  icon,
  initialExpanded = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = React.useState(initialExpanded);
  
  return (
    <div className={`border border-[#D4C9A8] rounded-lg overflow-hidden ${className}`}>
      <div 
        className="flex items-center justify-between p-2 bg-[#E9E2D0] cursor-pointer hover:bg-[#DFD6C0]"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          {icon && <span className="mr-2">{icon}</span>}
          <span className="font-medium">{title}</span>
        </div>
        <span>{isExpanded ? '▼' : '►'}</span>
      </div>
      
      {isExpanded && (
        <div className="p-3 bg-white border-t border-[#D4C9A8]">
          {children}
        </div>
      )}
    </div>
  );
};

// Markdown components for consistent rendering
export const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-bold my-4" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-bold my-3" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-bold my-3" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-base font-bold my-2" {...props}>{children}</h4>
  ),
  p: ({ children, ...props }) => (
    <p className="my-2" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-6 my-2" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-6 my-2" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="my-1" {...props}>{children}</li>
  ),
  code: ({ node, className, children, inline, ...props }: any) => {
    return inline ? (
      <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded font-mono text-sm" {...props}>
        {children}
      </code>
    ) : (
      <pre className="bg-gray-100 p-3 rounded-md overflow-x-auto my-3">
        <code className="text-gray-800 font-mono text-sm" {...props}>
          {children}
        </code>
      </pre>
    );
  },
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-4 border-gray-300 pl-4 italic my-3" {...props}>{children}</blockquote>
  ),
}; 