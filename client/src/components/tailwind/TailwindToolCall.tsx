import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// Custom renderers for markdown elements
const renderers = {
  // Make heading styles more consistent
  h1: (props: any) => <h1 className="text-2xl font-bold my-4" {...props} />,
  h2: (props: any) => <h2 className="text-xl font-bold my-3" {...props} />,
  h3: (props: any) => <h3 className="text-lg font-bold my-3" {...props} />,
  h4: (props: any) => <h4 className="text-base font-bold my-2" {...props} />,
  
  // Style paragraphs
  p: (props: any) => <p className="my-2" {...props} />,
  
  // Style lists
  ul: (props: any) => <ul className="list-disc pl-6 my-2" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-6 my-2" {...props} />,
  li: (props: any) => <li className="my-1" {...props} />,
  
  // Style code blocks
  code: ({ node, inline, className, children, ...props }: any) => {
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
  
  // Style blockquotes
  blockquote: (props: any) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-3" {...props} />,
};

interface ToolCallProps {
  toolName: string;
  header: string;
  args: string;
  result: string;
  initialExpanded?: boolean;
}

const TailwindToolCall: React.FC<ToolCallProps> = ({ 
  toolName, 
  header, 
  args, 
  result,
  initialExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
  };

  const formatArgs = (argsString: string) => {
    try {
      const parsed = JSON.parse(argsString);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // If not valid JSON, return as is
      return argsString;
    }
  };

  return (
    <div className="border border-[#D4C9A8] rounded-lg overflow-hidden mb-3">
      <div 
        className="flex items-center justify-between p-2 bg-[#E9E2D0] cursor-pointer hover:bg-[#DFD6C0]"
        onClick={toggleExpansion}
      >
        <div className="flex items-center">
          <span className="mr-2">🔧</span>
          <span className="font-medium">{header || toolName}</span>
        </div>
        <span>{isExpanded ? '▼' : '►'}</span>
      </div>
      
      {isExpanded && (
        <div className="p-3 bg-white border-t border-[#D4C9A8]">
          <div className="mb-3">
            <div className="font-medium text-sm text-gray-700 mb-1">Arguments:</div>
            <pre className="p-2 bg-gray-50 rounded border border-gray-200 text-xs overflow-x-auto text-gray-900">{formatArgs(args)}</pre>
          </div>
          <div>
            <div className="font-medium text-sm text-gray-700 mb-1">Result:</div>
            <div className="prose prose-sm max-w-none p-2 bg-gray-50 rounded border border-gray-200">
              <ReactMarkdown components={renderers}>
                {result}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TailwindToolCall;