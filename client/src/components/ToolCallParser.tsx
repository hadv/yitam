import React from 'react';
import ReactMarkdown from 'react-markdown';
import ToolCall from './ToolCall';

interface ToolCallParserProps {
  text: string;
}

const ToolCallParser: React.FC<ToolCallParserProps> = ({ text }) => {
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
            parsedContent.push(<ReactMarkdown key={`text-${lastIndex}`}>{beforeText}</ReactMarkdown>);
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
          <ToolCall
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
          parsedContent.push(<ReactMarkdown key={`text-end`}>{afterText}</ReactMarkdown>);
        }
      }
      
      return <>{parsedContent}</>;
    } catch (error) {
      console.error("Error parsing tool calls:", error);
      // Fallback to regular markdown if parsing fails
      return <ReactMarkdown>{text}</ReactMarkdown>;
    }
  }
  
  // Regular message without tool calls
  return <ReactMarkdown>{text}</ReactMarkdown>;
};

export default ToolCallParser; 