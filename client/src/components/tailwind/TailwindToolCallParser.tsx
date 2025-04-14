import React from 'react';
import ReactMarkdown from 'react-markdown';
import TailwindToolCall from './TailwindToolCall';

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

interface ToolCallParserProps {
  text: string;
}

const TailwindToolCallParser: React.FC<ToolCallParserProps> = ({ text }) => {
  // Check if message contains any tool call tags
  if (text.includes('<tool-call')) {
    try {
      // Create a more robust parsing method
      const parsedContent: React.ReactNode[] = [];
      let lastIndex = 0;
      
      // Regular expression to match tool-call blocks with their content
      const toolCallRegex = /<tool-call[^>]*>([\s\S]*?)<\/tool-call>/g;
      let match;
      
      while ((match = toolCallRegex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          const beforeText = text.substring(lastIndex, match.index);
          if (beforeText.trim()) {
            parsedContent.push(
              <div key={`text-${lastIndex}`} className="prose max-w-none">
                <ReactMarkdown components={renderers}>
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
        parsedContent.push(
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
      if (lastIndex < text.length) {
        const afterText = text.substring(lastIndex);
        if (afterText.trim()) {
          parsedContent.push(
            <div key="text-end" className="prose max-w-none">
              <ReactMarkdown components={renderers}>
                {afterText}
              </ReactMarkdown>
            </div>
          );
        }
      }
      
      return <>{parsedContent}</>;
    } catch (error) {
      console.error("Error parsing tool calls:", error);
      // Fallback to regular markdown if parsing fails
      return (
        <div className="prose max-w-none">
          <ReactMarkdown components={renderers}>
            {text}
          </ReactMarkdown>
        </div>
      );
    }
  }
  
  // Regular message without tool calls
  return (
    <div className="prose max-w-none">
      <ReactMarkdown components={renderers}>
        {text}
      </ReactMarkdown>
    </div>
  );
};

export default TailwindToolCallParser; 