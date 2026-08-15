import React, { useState, useEffect, useCallback } from 'react';
import type { Message, SearchFilters, Topic } from '../../db';
import { useChatHistoryStore } from '../../contexts/ChatHistoryContext';

interface SearchResult {
  message: Message;
  topic: Topic;
  highlightedContent?: string;
}

interface TailwindTopicSearchProps {
  userId: string;
  onSelectTopic: (topicId: number) => void;
  currentTopicId?: number;
}

const TailwindTopicSearch: React.FC<TailwindTopicSearchProps> = ({
  userId,
  onSelectTopic,
  currentTopicId
}) => {
  const store = useChatHistoryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchInCurrentTopic, setSearchInCurrentTopic] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'all' | 'user' | 'assistant'>('all');

  // Nothing here prepares the search index. The store repairs its own index on
  // the first search, so a first search on a history written before indexing
  // existed just takes a little longer — `isSearching` already covers that.

  // Highlight search terms in text
  const highlightText = (text: string, query: string): string => {
    if (!query.trim() || !text) return text;
    
    const words = query.toLowerCase().split(/\W+/).filter(word => word.length >= 3);
    if (words.length === 0) return text;
    
    let result = text;
    
    // Always use exact phrase highlighting
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
    
    return result;
  };

  // Perform search when the search query or filters change
  const performSearch = useCallback(async () => {
    if (!searchQuery.trim() || !userId) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      const filters: SearchFilters = {
        exact: true // Always use exact search
      };
      
      // Add role filter if selected
      if (selectedRole !== 'all') {
        filters.role = selectedRole;
      }
      
      const results = await store.searchMessages(userId, searchQuery, { filters, limit: 20 });

      // Filter by current topic if needed
      const filteredResults = searchInCurrentTopic && currentTopicId
        ? results.filter(result => result.topic.id === currentTopicId)
        : results;

      // Add highlighted content
      setSearchResults(filteredResults.map(result => ({
        ...result,
        highlightedContent: highlightText(result.message.content, searchQuery)
      })));
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, userId, selectedRole, searchInCurrentTopic, currentTopicId, store]);

  // Handle search submission via Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch();
    }
  };

  // Debounce search to avoid excessive searches during typing
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    const timer = setTimeout(() => {
      performSearch();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Search input and filters */}
      <div className="mb-4">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm tin nhắn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full py-2 px-4 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5D4A38] focus:border-transparent"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              {isSearching ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#5D4A38]"></div>
              ) : (
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </div>
          </div>
        </div>
        
        {/* Search filters */}
        <div className="flex flex-wrap gap-4 text-sm">
          {currentTopicId && (
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={searchInCurrentTopic}
                onChange={() => setSearchInCurrentTopic(!searchInCurrentTopic)}
                className="form-checkbox h-4 w-4 text-[#78A161] rounded focus:ring-[#78A161]"
              />
              <span>Chỉ tìm trong cuộc trò chuyện hiện tại</span>
            </label>
          )}
          
          <div className="flex items-center space-x-2">
            <span>Vai trò:</span>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as 'all' | 'user' | 'assistant')}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#5D4A38]"
            >
              <option value="all">Tất cả</option>
              <option value="user">Người dùng</option>
              <option value="assistant">Trợ lý</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Search results */}
      <div className="flex-1 overflow-y-auto">
        {searchResults.length > 0 ? (
          <div className="space-y-4">
            {searchResults.map((result, index) => (
              <div 
                key={`${result.message.id}-${index}`}
                className="bg-white rounded-lg shadow p-4 cursor-pointer hover:bg-[#F2EEE5] transition-colors"
                onClick={() => result.topic.id && onSelectTopic(result.topic.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium text-[#3A2E22]">{result.topic.title}</h3>
                  <span className="text-xs text-gray-500">{formatDate(result.message.timestamp)}</span>
                </div>
                
                <div className="flex items-center text-xs text-gray-500 mb-2">
                  <span className={`px-2 py-0.5 rounded-full ${
                    result.message.role === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {result.message.role === 'user' ? 'Người dùng' : 'Trợ lý'}
                  </span>
                  
                  {result.topic.id === currentTopicId && (
                    <span className="ml-2 bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      Cuộc trò chuyện hiện tại
                    </span>
                  )}
                </div>
                
                <div 
                  className="text-sm text-gray-700 line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: result.highlightedContent || result.message.content }}
                />
              </div>
            ))}
          </div>
        ) : (
          searchQuery.trim() ? (
            isSearching ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5D4A38] mx-auto mb-4"></div>
                <p>Đang tìm kiếm...</p>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>Không tìm thấy kết quả</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>Nhập từ khóa để tìm kiếm tin nhắn</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default TailwindTopicSearch; 