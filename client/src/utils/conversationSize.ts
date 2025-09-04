/**
 * Utility functions for estimating and managing conversation size
 */

export interface ConversationSizeInfo {
  sizeBytes: number;
  sizeMB: number;
  messageCount: number;
  averageMessageSize: number;
  canShare: boolean;
  warning?: string;
}

/**
 * Calculate the size of a conversation request
 */
export function calculateConversationSize(shareRequest: any): ConversationSizeInfo {
  const requestJson = JSON.stringify(shareRequest);
  const sizeBytes = new Blob([requestJson]).size;
  const sizeMB = sizeBytes / (1024 * 1024);
  const messageCount = shareRequest.messages?.length || 0;
  const averageMessageSize = messageCount > 0 ? sizeBytes / messageCount : 0;
  
  // 8MB limit (leaving buffer from 10MB nginx limit)
  const maxSizeBytes = 8 * 1024 * 1024;
  const canShare = sizeBytes < maxSizeBytes; // Use < instead of <= to leave some buffer
  
  let warning: string | undefined;
  
  if (sizeMB > 5) {
    warning = 'This conversation is quite large and may take longer to share.';
  }
  
  if (!canShare) {
    warning = `Conversation is too large to share (${sizeMB.toFixed(2)}MB). Maximum size is 8MB.`;
  }
  
  return {
    sizeBytes,
    sizeMB: parseFloat(sizeMB.toFixed(2)),
    messageCount,
    averageMessageSize: Math.round(averageMessageSize),
    canShare,
    warning
  };
}

/**
 * Format size in human-readable format
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * Suggest ways to reduce conversation size
 */
export function getSizeReductionSuggestions(sizeInfo: ConversationSizeInfo): string[] {
  const suggestions: string[] = [];
  
  if (sizeInfo.messageCount > 50) {
    suggestions.push('Consider sharing only the most recent part of the conversation');
  }
  
  if (sizeInfo.averageMessageSize > 2000) {
    suggestions.push('Some messages are very long - consider summarizing key points');
  }
  
  if (sizeInfo.sizeMB > 5) {
    suggestions.push('Try removing any large code blocks or repeated content');
    suggestions.push('Consider sharing the conversation in multiple parts');
  }
  
  return suggestions;
}
