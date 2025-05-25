import React, { useState, useEffect, useRef } from 'react';
import db, { Topic } from '../../db/ChatHistoryDB';

interface TopicSwitcherProps {
  userId: string;
  currentTopicId?: number;
  onSelectTopic: (topicId: number) => void;
  onCreateTopic: () => void;
  onEditTopic?: (topic: Topic) => void;
}

const TailwindTopicSwitcher: React.FC<TopicSwitcherProps> = ({
  userId,
  currentTopicId,
  onSelectTopic,
  onCreateTopic,
  onEditTopic
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'lastActive' | 'createdAt' | 'title' | 'messageCnt'>('lastActive');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);

  // Fetch topics from database
  useEffect(() => {
    const loadTopics = async () => {
      try {
        // Get all topics for this user
        const userTopics = await db.topics
          .where('userId')
          .equals(userId)
          .toArray();
          
        setTopics(userTopics);

        // Find current topic
        if (currentTopicId) {
          const current = userTopics.find(t => t.id === currentTopicId);
          if (current) {
            setCurrentTopic(current);
          }
        }
      } catch (error) {
        console.error('Error loading topics for switcher:', error);
      }
    };

    loadTopics();
  }, [userId, currentTopicId]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter topics based on search term
  const filteredTopics = topics.filter(topic => 
    topic.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort topics based on selected option
  const sortedTopics = [...filteredTopics].sort((a, b) => {
    switch (sortOption) {
      case 'lastActive':
        return b.lastActive - a.lastActive;
      case 'createdAt': 
        return b.createdAt - a.createdAt;
      case 'title':
        return a.title.localeCompare(b.title);
      case 'messageCnt':
        const aCount = a.messageCnt || 0;
        const bCount = b.messageCnt || 0;
        return bCount - aCount;
      default:
        return 0;
    }
  });

  // Group topics by pinned state
  const pinnedTopics = sortedTopics.filter(topic => topic.pinnedState);
  const unpinnedTopics = sortedTopics.filter(topic => !topic.pinnedState);

  // Combine pinned and unpinned topics
  const orderedTopics = [...pinnedTopics, ...unpinnedTopics];

  // Truncate title if too long
  const truncateTitle = (title: string, maxLength: number = 30) => {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  };

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit' 
    });
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex justify-between items-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-[#3A2E22] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5D4A38]"
          aria-expanded="true"
          aria-haspopup="true"
        >
          <span className="truncate max-w-[150px]">
            {currentTopic ? truncateTitle(currentTopic.title) : 'Chọn chủ đề'}
          </span>
          <svg className="h-5 w-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div 
          className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
        >
          <div className="p-2">
            <div className="p-2 border-b">
              <input
                type="text"
                placeholder="Tìm chủ đề..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#5D4A38]"
              />
            </div>
            
            <div className="py-1 px-2 border-b">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Sắp xếp theo:</span>
                <div className="relative inline-block text-left">
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as any)}
                    className="text-xs bg-gray-50 border border-gray-200 rounded p-1 focus:outline-none"
                  >
                    <option value="lastActive">Hoạt động gần đây</option>
                    <option value="createdAt">Ngày tạo</option>
                    <option value="title">Tiêu đề (A-Z)</option>
                    <option value="messageCnt">Số tin nhắn</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="max-h-60 overflow-y-auto py-1">
              {orderedTopics.length > 0 ? (
                orderedTopics.map(topic => (
                  <div 
                    key={topic.id}
                    className={`group w-full text-left px-3 py-2 text-sm rounded-md ${
                      currentTopicId === topic.id 
                        ? 'bg-[#F2EEE5] text-[#3A2E22]' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <button
                        className="flex-1 text-left"
                        onClick={() => {
                          if (topic.id) {
                            onSelectTopic(topic.id);
                            setIsOpen(false);
                          }
                        }}
                      >
                        <div className="font-medium flex items-center">
                          {topic.pinnedState && (
                            <svg className="h-3 w-3 mr-1 text-[#5D4A38]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          )}
                          {topic.title}
                        </div>
                        <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
                          <span>{formatDate(topic.lastActive)}</span>
                          {topic.messageCnt !== undefined && (
                            <span className="flex items-center">
                              <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                              {topic.messageCnt}
                            </span>
                          )}
                        </div>
                      </button>
                      
                      {onEditTopic && (
                        <button
                          className="p-1 text-gray-400 hover:text-[#5D4A38] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          onClick={() => {
                            onEditTopic(topic);
                            setIsOpen(false);
                          }}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500 text-center">
                  {searchTerm 
                    ? 'Không tìm thấy chủ đề phù hợp' 
                    : 'Chưa có chủ đề nào'}
                </div>
              )}
            </div>
            
            <div className="border-t pt-2 mt-1">
              <button
                className="w-full text-left flex items-center px-3 py-2 text-sm text-[#5D4A38] hover:bg-gray-100 rounded-md"
                onClick={() => {
                  onCreateTopic();
                  setIsOpen(false);
                }}
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Tạo chủ đề mới
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TailwindTopicSwitcher; 