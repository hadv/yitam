import React, { useState, useEffect } from 'react';
import { sharedConversationService } from '../../services/SharedConversationService';
import type { OwnedConversation } from '../../services/SharedConversationService';

interface ManageSharedConversationsProps {
  onClose: () => void;
  ownerId?: string;
  accessCode?: string;
}

const TailwindManageSharedConversations: React.FC<ManageSharedConversationsProps> = ({ 
  onClose, 
  ownerId, 
  accessCode 
}) => {
  const [conversations, setConversations] = useState<OwnedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [isUnsharing, setIsUnsharing] = useState(false);

  useEffect(() => {
    fetchOwnedConversations();
  }, [ownerId, accessCode]);

  const fetchOwnedConversations = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await sharedConversationService.getOwnedConversations(ownerId, accessCode);
      
      if (result.success && result.conversations) {
        setConversations(result.conversations);
      } else {
        setError(result.error || 'Failed to fetch conversations');
      }
    } catch (err) {
      console.error('Error fetching owned conversations:', err);
      setError('Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (shareId: string) => {
    const newSelected = new Set(selectedConversations);
    if (newSelected.has(shareId)) {
      newSelected.delete(shareId);
    } else {
      newSelected.add(shareId);
    }
    setSelectedConversations(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedConversations.size === conversations.length) {
      setSelectedConversations(new Set());
    } else {
      setSelectedConversations(new Set(conversations.map(c => c.id)));
    }
  };

  const handleUnshareSelected = async () => {
    if (selectedConversations.size === 0) return;

    try {
      setIsUnsharing(true);
      const shareIds = Array.from(selectedConversations);
      
      const result = await sharedConversationService.batchUnshareConversations(
        shareIds, 
        ownerId, 
        accessCode
      );

      if (result.success) {
        // Refresh the list
        await fetchOwnedConversations();
        setSelectedConversations(new Set());
        
        // Conversations unshared successfully - no alert needed
      } else {
        setError(result.error || 'Failed to unshare conversations');
      }
    } catch (err) {
      console.error('Error unsharing conversations:', err);
      setError('Failed to unshare conversations');
    } finally {
      setIsUnsharing(false);
    }
  };

  const handleUnshareOne = async (shareId: string) => {
    try {
      const result = await sharedConversationService.unshareConversation(shareId, ownerId, accessCode);
      
      if (result.success) {
        // Refresh the list
        await fetchOwnedConversations();
        // Conversation unshared successfully - no alert needed
      } else {
        setError(result.error || 'Failed to unshare conversation');
      }
    } catch (err) {
      console.error('Error unsharing conversation:', err);
      setError('Failed to unshare conversation');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyShareUrl = async (shareId: string) => {
    const url = `http://localhost:3001/shared/${shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      // Could add a toast notification here instead of alert
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const activeConversations = conversations.filter(c => c.is_active);
  const inactiveConversations = conversations.filter(c => !c.is_active);

  return (
    <div className="p-6 max-h-[80vh] overflow-y-auto">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-[#3A2E22] mb-2">
          Quản lý cuộc trò chuyện đã chia sẻ
        </h3>
        <p className="text-[#5D4A38] text-sm">
          Xem và quản lý các cuộc trò chuyện bạn đã chia sẻ
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin h-8 w-8 border-2 border-[#5D4A38] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[#3A2E22]">Đang tải...</p>
        </div>
      ) : (
        <>
          {/* Active Conversations */}
          {activeConversations.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-[#3A2E22]">
                  Cuộc trò chuyện đang hoạt động ({activeConversations.length})
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1 text-sm text-[#5D4A38] hover:text-[#4A3A2A] border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    {selectedConversations.size === activeConversations.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                  {selectedConversations.size > 0 && (
                    <button
                      onClick={handleUnshareSelected}
                      disabled={isUnsharing}
                      className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
                    >
                      {isUnsharing ? 'Đang hủy chia sẻ...' : `Hủy chia sẻ (${selectedConversations.size})`}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {activeConversations.map((conversation) => (
                  <div key={conversation.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedConversations.has(conversation.id)}
                          onChange={() => handleSelectConversation(conversation.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <h5 className="font-medium text-[#3A2E22] mb-1">{conversation.title}</h5>
                          <div className="text-sm text-[#5D4A38] space-y-1">
                            <div>Chia sẻ lúc: {formatDate(conversation.created_at)}</div>
                            <div>{conversation.view_count} lượt xem</div>
                            {conversation.expires_at && (
                              <div>Hết hạn: {formatDate(conversation.expires_at)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyShareUrl(conversation.id)}
                          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          title="Sao chép liên kết"
                        >
                          Sao chép
                        </button>
                        <button
                          onClick={() => handleUnshareOne(conversation.id)}
                          className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          title="Hủy chia sẻ"
                        >
                          Hủy chia sẻ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inactive Conversations */}
          {inactiveConversations.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-600 mb-4">
                Cuộc trò chuyện đã hủy chia sẻ ({inactiveConversations.length})
              </h4>
              <div className="space-y-3">
                {inactiveConversations.map((conversation) => (
                  <div key={conversation.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-600 mb-1">{conversation.title}</h5>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>Đã chia sẻ: {formatDate(conversation.created_at)}</div>
                          <div>{conversation.view_count} lượt xem (trước khi hủy)</div>
                          <div className="text-red-600">Đã hủy chia sẻ</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {conversations.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>Bạn chưa chia sẻ cuộc trò chuyện nào</p>
            </div>
          )}
        </>
      )}

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-[#5D4A38] text-white rounded-lg hover:bg-[#4A3A2A] transition-colors"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};

export default TailwindManageSharedConversations;
