import React, { useState, useEffect } from 'react';
import db, { Topic } from '../../db/ChatHistoryDB';
import TailwindTopicCreateButton from './TailwindTopicCreateButton';

interface TopicListProps {
  userId: string;
  onSelectTopic: (topicId: number) => void;
  onCreateTopic: () => void;
  onDeleteTopic: (topicId: number) => void;
  onEditTopic: (topic: Topic) => void;
  currentTopicId?: number;
}

const TailwindTopicList: React.FC<TopicListProps> = ({
  userId,
  onSelectTopic,
  onCreateTopic,
  onDeleteTopic,
  onEditTopic,
  currentTopicId
}) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sortOption, setSortOption] = useState<'lastActive' | 'createdAt' | 'title'>('lastActive');
  const [isLoading, setIsLoading] = useState(true);

    const loadTopics = async () => {
      try {
        setIsLoading(true);
        
        // Get all topics for this user
        const userTopics = await db.topics
          .where('userId')
          .equals(userId)
          .toArray();
          
        setTopics(userTopics);
      } catch (error) {
        console.error('Error loading topics:', error);
      } finally {
        setIsLoading(false);
      }
    };

  useEffect(() => {
    loadTopics();
  }, [userId, currentTopicId]);

  const sortTopics = (topicsToSort: Topic[]) => {
    const sorted = [...topicsToSort];
    
    switch (sortOption) {
      case 'lastActive':
        return sorted.sort((a, b) => b.lastActive - a.lastActive);
      case 'createdAt':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return sorted;
    }
  };

  const handleSortChange = (option: 'lastActive' | 'createdAt' | 'title') => {
    setSortOption(option);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  // Sort topics and then separate pinned topics to top
  const sortedTopicsRaw = sortTopics(topics);
  const pinnedTopics = sortedTopicsRaw.filter(topic => topic.pinnedState);
  const unpinnedTopics = sortedTopicsRaw.filter(topic => !topic.pinnedState);
  const sortedTopics = [...pinnedTopics, ...unpinnedTopics];

  return (
    <div className="w-full bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-[#3A2E22]">Chủ đề</h2>
        <div className="flex space-x-2">
          <div className="relative">
            <select 
              className="appearance-none bg-[#F2EEE5] text-[#3A2E22] py-1 px-3 pr-8 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5D4A38]"
              value={sortOption}
              onChange={(e) => handleSortChange(e.target.value as any)}
            >
              <option value="lastActive">Hoạt động gần đây</option>
              <option value="createdAt">Ngày tạo</option>
              <option value="title">Tên</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#3A2E22]">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <TailwindTopicCreateButton onClick={onCreateTopic} size="sm" />
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5D4A38]"></div>
        </div>
      ) : sortedTopics.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <p className="mb-4">Chưa có chủ đề nào. Hãy tạo chủ đề mới để bắt đầu.</p>
          <TailwindTopicCreateButton onClick={onCreateTopic} variant="secondary" className="mx-auto" />
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 max-h-[60vh] overflow-y-auto">
          {sortedTopics.map(topic => (
            <li 
              key={topic.id} 
              className={`p-4 hover:bg-[#F2EEE5] transition-colors duration-200 cursor-pointer ${
                topic.id === currentTopicId ? 'bg-[#F2EEE5]' : ''
              }`}
              onClick={() => topic.id && onSelectTopic(topic.id)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="text-base font-medium truncate text-[#3A2E22] flex items-center">
                    {topic.pinnedState && (
                      <svg className="h-3 w-3 mr-1 text-[#5D4A38] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    )}
                    <span>{topic.title}</span>
                  </h3>
                  <div className="flex items-center mt-1 text-xs text-gray-500">
                    <span>{formatDate(topic.lastActive)}</span>
                    {topic.messageCnt && (
                      <span className="ml-2 flex items-center">
                        <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        {topic.messageCnt}
                      </span>
                    )}
                    {topic.model && (
                      <span className="ml-2 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-[10px]">
                        {topic.model.includes('opus') ? 'Opus' : 
                         topic.model.includes('sonnet') ? 'Sonnet' : 
                         topic.model.includes('haiku') ? 'Haiku' : 'Claude'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTopic(topic);
                    }}
                    className="p-1 text-gray-500 hover:text-[#5D4A38] focus:outline-none"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      topic.id && onDeleteTopic(topic.id);
                    }}
                    className="p-1 text-gray-500 hover:text-red-500 focus:outline-none"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TailwindTopicList; 