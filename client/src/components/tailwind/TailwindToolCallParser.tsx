import React, { useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TailwindToolCall from './TailwindToolCall';

// Robust normalization for LLM output
function robustNormalizeBlockquotes(text: string): string {
  // Convert all \\n to \n
  let normalized = text.replace(/\\n/g, '\n');
  // Convert &gt; to >
  normalized = normalized.replace(/&gt;/g, '>');
  // Normalize blockquotes: convert lines starting with optional whitespace + > to just >
  normalized = normalized.replace(/^[ \t]*>[ \t]?/gm, '> ');
  return normalized;
}

// Custom renderers for markdown elements - moved outside component to prevent recreation
const customRenderers = {
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
  
  // Style blockquotes with visible left border
  blockquote: (props: any) => (
    <blockquote className="my-3 border-l-4 border-[#5D4A38] bg-[#F7F5F0] pl-4 pr-3 py-2 rounded-r-md text-[#3A2E22] italic">
      {props.children}
    </blockquote>
  ),
};

interface ToolCallParserProps {
  text: string;
}

const TailwindToolCallParser: React.FC<ToolCallParserProps> = ({ text }) => {
  // Normalize blockquotes in the text - memoized to prevent recomputation on rerenders
  const normalizedText = useMemo(() => {
    if (!text) return '';
    return robustNormalizeBlockquotes(text);
  }, [text]);
  
  // Parse content with tool calls - memoized for performance
  const parsedContent = useMemo(() => {
    // Check if message contains any tool call tags
    if (!normalizedText || !normalizedText.includes('<tool-call')) {
      // Regular message without tool calls
      return (
        <div className="prose max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={customRenderers}>
            {normalizedText}
          </ReactMarkdown>
        </div>
      );
    }
    
    try {
      // Create a more robust parsing method
      const contentParts: React.ReactNode[] = [];
      let lastIndex = 0;
      
      // Regular expression to match tool-call blocks with their content
      const toolCallRegex = /<tool-call[^>]*>([\s\S]*?)<\/tool-call>/g;
      let match;
      
      while ((match = toolCallRegex.exec(normalizedText)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          const beforeText = normalizedText.substring(lastIndex, match.index);
          if (beforeText.trim()) {
            contentParts.push(
              <div key={`text-${lastIndex}`} className="prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={customRenderers}>
                  {beforeText}
                </ReactMarkdown>
              </div>
            );
          }
        }
        
        // Extract the tool call content
        const toolCallContent = match[1];
        const toolCall = match[0];
        
        // Extract tool name
        const toolNameMatch = toolCall.match(/data-tool="([^"]+)"/);
        const toolName = toolNameMatch ? toolNameMatch[1] : 'Tool';
        
        // Extract header, args and result
        const headerMatch = /<tool-header>([\s\S]*?)<\/tool-header>/i.exec(toolCallContent);
        const header = headerMatch ? headerMatch[1] : toolName;
        
        const argsMatch = /<tool-args>([\s\S]*?)<\/tool-args>/i.exec(toolCallContent);
        const args = argsMatch ? argsMatch[1] : '{}';
        
        const resultMatch = /<tool-result>([\s\S]*?)<\/tool-result>/i.exec(toolCallContent);
        const result = resultMatch ? resultMatch[1] : '';
        
        // Add the ToolCall component
        contentParts.push(
          <TailwindToolCall
            key={`tool-${match.index}`}
            toolName={toolName}
            header={header}
            args={args}
            result={result}
          />
        );
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining text after the last match
      if (lastIndex < normalizedText.length) {
        const afterText = normalizedText.substring(lastIndex);
        if (afterText.trim()) {
          contentParts.push(
            <div key="text-end" className="prose max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={customRenderers}>
                {afterText}
              </ReactMarkdown>
            </div>
          );
        }
      }
      
      return <>{contentParts}</>;
    } catch (error) {
      console.error("Error parsing tool calls:", error);
      // Fallback to regular markdown if parsing fails
      return (
        <div className="prose max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={customRenderers}>
            {normalizedText}
          </ReactMarkdown>
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-1 p-1 bg-red-100 text-red-700 text-xs rounded">
              Error parsing tool calls: {error instanceof Error ? error.message : String(error)}
            </div>
          )}
        </div>
      );
    }
  }, [normalizedText]);
  
  return parsedContent;
};

// Use memo to prevent unnecessary re-renders when text hasn't changed
export default memo(TailwindToolCallParser, (prevProps, nextProps) => {
  return prevProps.text === nextProps.text;
}); 