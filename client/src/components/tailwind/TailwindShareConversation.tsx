import React, { useState, useEffect } from 'react';
import { sharedConversationService } from '../../services/SharedConversationService';
import db, { Topic, Message } from '../../db/ChatHistoryDB';
import { useAuth } from '../../hooks/useAuth';
import { calculateConversationSize, formatSize, getSizeReductionSuggestions } from '../../utils/conversationSize';

interface ShareConversationProps {
  topicId: number;
  onClose: () => void;
  onManageShared?: () => void;
  onConversationShared?: () => void; // Callback when conversation is successfully shared
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  persona_id?: string;
}

const TailwindShareConversation: React.FC<ShareConversationProps> = ({ topicId, onClose, onManageShared, onConversationShared }) => {
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expirationDays, setExpirationDays] = useState<number>(30);
  const [copySuccess, setCopySuccess] = useState(false);
  const [conversationSize, setConversationSize] = useState<string>('');
  const [sizeWarning, setSizeWarning] = useState<string>('');

  // Get user information for ownership tracking
  const { user } = useAuth();

  // Calculate conversation size on component mount
  useEffect(() => {
    const calculateSize = async () => {
      try {
        const topic = await db.topics.get(topicId);
        if (!topic) return;

        const messages = await db.messages
          .where('topicId')
          .equals(topicId)
          .sortBy('timestamp');

        const conversationMessages: ConversationMessage[] = messages.map((msg: Message) => ({
          id: msg.id?.toString() || Date.now().toString(),
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          persona_id: topic.personaId
        }));

        const shareRequest = {
          title: topic.title,
          messages: conversationMessages,
          persona_id: topic.personaId,
          expires_in_days: expirationDays > 0 ? expirationDays : undefined
        };

        const sizeInfo = calculateConversationSize(shareRequest);
        setConversationSize(formatSize(sizeInfo.sizeBytes));

        if (sizeInfo.warning) {
          setSizeWarning(sizeInfo.warning);
        }
      } catch (error) {
        console.error('Error calculating conversation size:', error);
      }
    };

    calculateSize();
  }, [topicId, expirationDays]);

  const handleShare = async () => {
    try {
      setIsSharing(true);
      setError(null);

      // Get topic and messages from local database
      const topic = await db.topics.get(topicId);
      if (!topic) {
        throw new Error('Conversation not found');
      }

      const messages = await db.messages
        .where('topicId')
        .equals(topicId)
        .sortBy('timestamp');

      if (messages.length === 0) {
        throw new Error('No messages found in this conversation');
      }

      // Convert messages to the format expected by the API
      const conversationMessages: ConversationMessage[] = messages.map((msg: Message) => ({
        id: msg.id?.toString() || Date.now().toString(),
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        persona_id: topic.personaId
      }));

      // Prepare share request
      const shareRequest = {
        title: topic.title,
        messages: conversationMessages,
        persona_id: topic.personaId,
        expires_in_days: expirationDays > 0 ? expirationDays : undefined
      };

      // Validate conversation size before sending
      const sizeInfo = calculateConversationSize(shareRequest);

      if (!sizeInfo.canShare) {
        const suggestions = getSizeReductionSuggestions(sizeInfo);
        const suggestionText = suggestions.length > 0
          ? `\n\nSuggestions to reduce size:\n• ${suggestions.join('\n• ')}`
          : '';
        throw new Error(`${sizeInfo.warning}${suggestionText}`);
      }

      // Use the cached service to share conversation with user identification
      const result = await sharedConversationService.shareConversation(shareRequest, user?.email);

      if (!result.success) {
        throw new Error(result.error || 'Failed to share conversation');
      }

      setShareUrl(result.shareUrl!);

      // Notify parent that conversation was shared successfully
      if (onConversationShared) {
        onConversationShared();
      }
    } catch (err) {
      console.error('Error sharing conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to share conversation');
    } finally {
      setIsSharing(false);
    }
  };

  const copyToClipboard = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000); // Hide after 2 seconds
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  return (
    <div className="p-6">
      {!shareUrl ? (
        <>
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-[#3A2E22] mb-2">
              Chia sẻ cuộc trò chuyện
            </h3>
            <p className="text-[#5D4A38] text-sm">
              Tạo một liên kết công khai để chia sẻ cuộc trò chuyện này với người khác.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[#3A2E22] mb-2">
              Thời gian hết hạn
            </label>
            <select
              value={expirationDays}
              onChange={(e) => setExpirationDays(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5D4A38] focus:border-transparent"
            >
              <option value={7}>7 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={0}>Không hết hạn</option>
            </select>
            <p className="text-xs text-[#5D4A38] mt-1">
              Liên kết sẽ tự động hết hạn sau thời gian đã chọn
            </p>
          </div>

          {/* Conversation size information */}
          {conversationSize && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-700">
                  Kích thước cuộc trò chuyện: <strong>{conversationSize}</strong>
                </span>
                <span className="text-xs text-blue-600">
                  Giới hạn: 8MB
                </span>
              </div>
              {sizeWarning && (
                <p className="text-xs text-blue-600 mt-1">{sizeWarning}</p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleShare}
              disabled={isSharing}
              className="flex-1 bg-[#5D4A38] text-white px-4 py-2 rounded-lg hover:bg-[#4A3A2A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSharing ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Đang tạo liên kết...
                </span>
              ) : (
                'Tạo liên kết chia sẻ'
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-[#5D4A38] rounded-lg hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-[#3A2E22] mb-2">
              Liên kết chia sẻ đã tạo thành công!
            </h3>
            <p className="text-[#5D4A38] text-sm">
              Sao chép liên kết bên dưới để chia sẻ cuộc trò chuyện này.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[#3A2E22] mb-2">
              Liên kết chia sẻ
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-[#3A2E22] text-sm"
              />
              <button
                onClick={copyToClipboard}
                className={`px-4 py-2 rounded-lg transition-colors text-sm ${
                  copySuccess
                    ? 'bg-green-500 text-white'
                    : 'bg-[#5D4A38] text-white hover:bg-[#4A3A2A]'
                }`}
              >
                {copySuccess ? '✓ Đã sao chép' : 'Sao chép'}
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
            <p className="text-blue-700 text-sm">
              <strong>Lưu ý:</strong> Bất kỳ ai có liên kết này đều có thể xem cuộc trò chuyện.
              {expirationDays > 0 && ` Liên kết sẽ hết hạn sau ${expirationDays} ngày.`}
            </p>
            <p className="text-blue-600 text-xs mt-2">
              Bạn có thể hủy chia sẻ cuộc trò chuyện này bất cứ lúc nào thông qua trang quản lý.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyToClipboard}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                copySuccess
                  ? 'bg-green-500 text-white'
                  : 'bg-[#5D4A38] text-white hover:bg-[#4A3A2A]'
              }`}
            >
              {copySuccess ? '✓ Đã sao chép liên kết' : 'Sao chép liên kết'}
            </button>
            {onManageShared && (
              <button
                onClick={() => {
                  onClose();
                  onManageShared();
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Quản lý
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-[#5D4A38] rounded-lg hover:bg-gray-50 transition-colors"
            >
              Đóng
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TailwindShareConversation;
