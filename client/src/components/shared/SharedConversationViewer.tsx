import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSharedConversationCache } from '../../contexts/SharedConversationCacheContext';
import TailwindToolCallParser from '../tailwind/TailwindToolCallParser';

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  persona_id?: string;
}

interface SharedConversationData {
  id: string;
  title: string;
  messages: ConversationMessage[];
  persona_id?: string;
  created_at: string;
  view_count: number;
  stats?: {
    viewCount: number;
    createdAt: string;
  };
}

const SharedConversationViewer: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [conversation, setConversation] = useState<SharedConversationData | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Use the cache context
  const {
    getConversation,
    getCachedConversation,
    isLoading,
    error: cacheError
  } = useSharedConversationCache();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError('Invalid share link');
      return;
    }

    fetchSharedConversation(shareId);
  }, [shareId]);

  // Update error state when cache error changes
  useEffect(() => {
    setError(cacheError);
  }, [cacheError]);

  const fetchSharedConversation = async (id: string, forceRefresh: boolean = false) => {
    try {
      setError(null);

      // Check if we can get it from cache first (for immediate display)
      if (!forceRefresh) {
        const cachedConversation = getCachedConversation(id);
        if (cachedConversation) {
          setConversation(cachedConversation);
          setIsFromCache(true);
          console.log('Displayed cached conversation immediately');
          return;
        }
      }

      // Fetch using cache context (which handles caching)
      const conversationData = await getConversation(id, forceRefresh);

      if (conversationData) {
        setConversation(conversationData);
        setIsFromCache(false);
      } else {
        setError('Failed to load conversation');
      }
    } catch (err) {
      console.error('Error fetching shared conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    }
  };

  const handleRefresh = () => {
    if (shareId) {
      fetchSharedConversation(shareId, true);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF6] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-[#5D4A38] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[#3A2E22]">Đang tải cuộc trò chuyện...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FDFBF6] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-[#3A2E22] mb-4">Không thể tải cuộc trò chuyện</h1>
          <p className="text-[#5D4A38] mb-6">{error}</p>
          <Link 
            to="/" 
            className="inline-block bg-[#5D4A38] text-white px-6 py-3 rounded-lg hover:bg-[#4A3A2A] transition-colors"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-[#FDFBF6] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#3A2E22]">Không tìm thấy cuộc trò chuyện</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF6] text-[#3A2E22]">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Link to="/" className="text-[#5D4A38] hover:text-[#4A3A2A] text-sm font-medium">
                ← Về Yitam
              </Link>
              <h1 className="text-2xl font-bold text-[#3A2E22] mt-2">{conversation.title}</h1>
              <div className="flex items-center gap-4 text-sm text-[#5D4A38] mt-1">
                <span>Chia sẻ lúc: {formatDate(conversation.created_at)}</span>
                <span>•</span>
                <span>{conversation.view_count} lượt xem</span>
                <span>•</span>
                <span>{conversation.messages.length} tin nhắn</span>
                {isFromCache && (
                  <>
                    <span>•</span>
                    <span className="text-green-600 text-xs">📋 Từ bộ nhớ đệm</span>
                  </>
                )}
              </div>
            </div>

            {/* Refresh button */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center px-3 py-2 text-sm text-[#5D4A38] hover:text-[#4A3A2A] hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                title="Làm mới cuộc trò chuyện"
              >
                <svg
                  className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Làm mới
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 space-y-6">
            {conversation.messages.map((message, index) => (
              <div 
                key={message.id} 
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === 'user' 
                      ? 'bg-[#5D4A38] text-white' 
                      : 'bg-gray-100 text-[#3A2E22]'
                  }`}
                >
                  <div className="break-words">
                    {message.role === 'assistant' ? (
                      // Use the same advanced parser as the main app for full markdown and tool call support
                      <TailwindToolCallParser text={message.content} />
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {message.content}
                      </div>
                    )}
                  </div>
                  <div 
                    className={`text-xs mt-2 ${
                      message.role === 'user' ? 'text-gray-300' : 'text-gray-500'
                    }`}
                  >
                    {formatMessageTime(message.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-[#5D4A38]">
          <p>Cuộc trò chuyện này được chia sẻ từ Yitam</p>
          <Link 
            to="/" 
            className="inline-block mt-2 text-[#5D4A38] hover:text-[#4A3A2A] font-medium"
          >
            Tạo cuộc trò chuyện của riêng bạn →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SharedConversationViewer;
