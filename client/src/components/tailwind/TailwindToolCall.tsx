import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ExpandablePanel, markdownComponents } from './common/UIComponents';

// Arguments display component - memoized for performance
const ArgumentsDisplay = memo(({ args }: { args: string }) => {
  // Memoize the formatting of arguments
  const formattedArgs = useMemo(() => {
    try {
      const parsed = JSON.parse(args);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // If not valid JSON, return as is
      return args;
    }
  }, [args]);

  return (
    <div className="mb-3">
      <div className="font-medium text-sm text-gray-700 mb-1">Arguments:</div>
      <pre className="p-2 bg-gray-50 rounded border border-gray-200 text-xs overflow-x-auto text-gray-900">
        {formattedArgs}
      </pre>
    </div>
  );
});

// Result display component - memoized for performance
const ResultDisplay = memo(({ result }: { result: string }) => (
  <div>
    <div className="font-medium text-sm text-gray-700 mb-1">Result:</div>
    <div className="prose prose-sm max-w-none p-2 bg-gray-50 rounded border border-gray-200">
      <ReactMarkdown components={markdownComponents}>
        {result}
      </ReactMarkdown>
    </div>
  </div>
));

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
  // Memoize the title for the ExpandablePanel
  const title = useMemo(() => header || toolName, [header, toolName]);
  
  return (
    <ExpandablePanel
      title={title}
      icon="🔧"
      initialExpanded={initialExpanded}
      className="mb-3"
    >
      <ArgumentsDisplay args={args} />
      <ResultDisplay result={result} />
    </ExpandablePanel>
  );
};

// Memoize the entire component to prevent unnecessary re-renders
export default memo(TailwindToolCall, (prevProps, nextProps) => {
  return (
    prevProps.toolName === nextProps.toolName &&
    prevProps.header === nextProps.header &&
    prevProps.args === nextProps.args &&
    prevProps.result === nextProps.result &&
    prevProps.initialExpanded === nextProps.initialExpanded
  );
});