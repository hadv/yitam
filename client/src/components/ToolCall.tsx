import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface ToolCallProps {
  toolName: string;
  header: string;
  args: string;
  result: string;
  initialExpanded?: boolean;
}

const ToolCall: React.FC<ToolCallProps> = ({ 
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

  return (
    <div className="tool-call-container">
      <div 
        className="tool-call-header" 
        onClick={toggleExpansion}
      >
        <span className="tool-icon">🔧</span>
        <span className="tool-name">{header || toolName}</span>
        <span className="tool-toggle">{isExpanded ? '▼' : '►'}</span>
      </div>
      {isExpanded && (
        <div className="tool-call-content">
          <div className="tool-call-section">
            <div className="tool-section-header">Arguments:</div>
            <pre className="tool-args">{args}</pre>
          </div>
          <div className="tool-call-section">
            <div className="tool-section-header">Result:</div>
            <div className="tool-result">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolCall; 