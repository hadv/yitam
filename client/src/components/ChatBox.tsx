import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChatBox.css';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
}

interface ChatBoxProps {
  messages: Message[];
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Toggle tool call expansion
  const toggleToolExpansion = (toolId: string) => {
    setExpandedTools(prev => ({
      ...prev,
      [toolId]: !prev[toolId]
    }));
  };

  // Parse tool call tags in message text
  const renderMessageContent = (text: string) => {
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
          
          // Generate a stable ID for this tool call (without using Date.now())
          const toolId = `tool-${toolName}-${match.index}`;
          
          // Extract header, args and result
          const headerMatch = /<tool-header>([\s\S]*?)<\/tool-header>/i.exec(toolCallContent);
          const header = headerMatch ? headerMatch[1] : toolName;
          
          const argsMatch = /<tool-args>([\s\S]*?)<\/tool-args>/i.exec(toolCallContent);
          const args = argsMatch ? argsMatch[1] : '{}';
          
          const resultMatch = /<tool-result>([\s\S]*?)<\/tool-result>/i.exec(toolCallContent);
          const result = resultMatch ? resultMatch[1] : '';
          
          const isExpanded = expandedTools[toolId] || false;
          
          // Add the formatted tool call component
          parsedContent.push(
            <div className="tool-call-container" key={`tool-${match.index}`}>
              <div 
                className="tool-call-header" 
                onClick={() => toggleToolExpansion(toolId)}
              >
                <span className="tool-icon">🔧</span>
                <span className="tool-name">{header}</span>
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

  return (
    <div className="chat-box">
      {messages.length === 0 ? (
        <div className="empty-chat">Start a conversation with Claude!</div>
      ) : (
        messages.map((message) => (
          <div 
            key={message.id} 
            className={`message ${message.isBot ? 'bot' : 'user'}`}
          >
            <div className="message-content">
              {message.isBot ? (
                <div className="message-text">
                  {renderMessageContent(message.text)}
                </div>
              ) : (
                <span className="message-text">{message.text}</span>
              )}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatBox; 