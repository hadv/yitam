import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ExpandablePanel, markdownComponents } from './common/UIComponents';

// Arguments display component
const ArgumentsDisplay: React.FC<{ args: string }> = ({ args }) => {
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
    <div className="mb-3">
      <div className="font-medium text-sm text-gray-700 mb-1">Arguments:</div>
      <pre className="p-2 bg-gray-50 rounded border border-gray-200 text-xs overflow-x-auto text-gray-900">
        {formatArgs(args)}
      </pre>
    </div>
  );
};

// Result display component
const ResultDisplay: React.FC<{ result: string }> = ({ result }) => (
  <div>
    <div className="font-medium text-sm text-gray-700 mb-1">Result:</div>
    <div className="prose prose-sm max-w-none p-2 bg-gray-50 rounded border border-gray-200">
      <ReactMarkdown components={markdownComponents}>
        {result}
      </ReactMarkdown>
    </div>
  </div>
);

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
  return (
    <ExpandablePanel
      title={header || toolName}
      icon="🔧"
      initialExpanded={initialExpanded}
      className="mb-3"
    >
      <ArgumentsDisplay args={args} />
      <ResultDisplay result={result} />
    </ExpandablePanel>
  );
};

export default TailwindToolCall;