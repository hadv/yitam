/**
 * Extracts a title from bot response text.
 * Tries to find markdown headers, then falls back to first line.
 */
export const extractTitleFromBotText = (botText: string): string => {
  if (!botText || botText.trim() === '') {
    return "New Conversation";
  }
  
  // First, remove any tool calls from the bot text
  let cleanedText = botText;
  
  // Match and remove tool calls
  const toolCallPatterns = [
    /<function_calls>[\s\S]*?<\/antml:function_calls>/gi,
    /<function_call>[\s\S]*?<\/function_call>/gi,
    /<tool_call>[\s\S]*?<\/tool_call>/gi
  ];
  
  for (const pattern of toolCallPatterns) {
    cleanedText = cleanedText.replace(pattern, '');
  }
  
  // Clean up any remaining XML/HTML-like tags that might be left
  cleanedText = cleanedText.replace(/<[^>]*>/g, '');
  
  // Split into lines for better processing
  const lines = cleanedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Look for markdown headers with priority:
  // 1. First # header (most important - this is what we want)
  // 2. First ## header (secondary)
  // 3. Any other header
  
  // First, try to find # headers (h1)
  const h1Lines = lines.filter(line => /^#\s+\S+/.test(line));
  if (h1Lines.length > 0) {
    const h1Text = h1Lines[0].replace(/^#\s+/, '').trim()
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '') // Remove bold/italic
      .replace(/^`|`$/g, '') // Remove code ticks
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, ''); // Remove emojis
    
    return h1Text;
  }
  
  // If no h1, try h2
  const h2Lines = lines.filter(line => /^##\s+\S+/.test(line));
  if (h2Lines.length > 0) {
    const h2Text = h2Lines[0].replace(/^##\s+/, '').trim()
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, '');
    
    return h2Text;
  }
  
  // If no h1 or h2, try any header (h3-h6)
  const anyHeaderLines = lines.filter(line => /^#{3,6}\s+\S+/.test(line));
  if (anyHeaderLines.length > 0) {
    const headerText = anyHeaderLines[0].replace(/^#{3,6}\s+/, '').trim()
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, '');
    
    return headerText;
  }
  
  // If no headers at all, use the first line that's not a list item or details
  // Exclude lines that look like list items, code blocks, or other non-title content
  const nonListLines = lines.filter(line => 
    !line.startsWith('- ') && 
    !line.startsWith('* ') && 
    !line.startsWith('+ ') && 
    !line.match(/^\d+\.\s/) &&
    !line.startsWith('```') &&
    !line.startsWith('&gt;') &&
    !line.startsWith('>') &&
    !line.startsWith('|')
  );
  
  if (nonListLines.length > 0) {
    // Get the first non-list line and clean it
    const firstLine = nonListLines[0]
      .replace(/^\*\*|\*\*$|^\*|\*$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/^[📜🌿💊🔍📚📋🧪⚗️🏷️]+\s*/, '');
    
    // Truncate if needed
    const title = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
    return title;
  }
  
  // Absolute fallback - use the first line no matter what
  if (lines.length > 0) {
    const fallbackTitle = lines[0].substring(0, 100).trim();
    return fallbackTitle;
  }
  
  return "New Conversation";
}; 