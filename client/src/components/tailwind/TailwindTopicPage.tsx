import React, { useState, useEffect } from 'react';
import TailwindTopicManager from './TailwindTopicManager';
import TailwindTopicSwitcher from './TailwindTopicSwitcher';
import TailwindTopicEditor from './TailwindTopicEditor';
import TailwindTopicCreateButton from './TailwindTopicCreateButton';
import db, { Topic } from '../../db/ChatHistoryDB';

interface TopicPageProps {
  userId: string;
  currentTopicId?: number;
  onSelectTopic: (topicId: number) => void;
  onBackToChat?: () => void;
}

const TailwindTopicPage: React.FC<TopicPageProps> = ({
  userId,
  currentTopicId,
  onSelectTopic,
  onBackToChat
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [topicToEdit, setTopicToEdit] = useState<Topic | undefined>(undefined);
  const [topicsCount, setTopicsCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);

  // Get topics and messages stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        // Count topics
        const topics = await db.topics
          .where('userId')
          .equals(userId)
          .count();
        
        setTopicsCount(topics);
        
        // Count total messages across all topics
        if (topics > 0) {
          const userTopics = await db.topics
            .where('userId')
            .equals(userId)
            .toArray();
            
          const topicIds = userTopics.map(t => t.id).filter(id => id !== undefined) as number[];
          
          if (topicIds.length > 0) {
            const messages = await db.messages
              .where('topicId')
              .anyOf(topicIds)
              .count();
              
            setMessageCount(messages);
          }
        }
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };
    
    loadStats();
  }, [userId]);
  
  // Handle creating a new topic
  const handleCreateTopic = () => {
    setTopicToEdit(undefined);
    setIsEditorOpen(true);
  };
  
  // Handle editing a topic
  const handleEditTopic = (topic: Topic) => {
    setTopicToEdit(topic);
    setIsEditorOpen(true);
  };
  
  // Handle saving a topic (new or edited)
  const handleSaveTopic = async (topicData: Topic) => {
    try {
      let topicId: number;
      
      if (topicData.id) {
        // Update existing topic
        await db.topics.update(topicData.id, topicData);
        topicId = topicData.id;
      } else {
        // Add new topic
        topicId = await db.topics.add(topicData);
      }
      
      // Switch to the saved topic
      onSelectTopic(topicId);
      setIsEditorOpen(false);
      
      // If onBackToChat is provided, go back to chat
      if (onBackToChat) {
        onBackToChat();
      }
    } catch (error) {
      console.error('Error saving topic:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8F6F1]">
      {/* Header with stats and actions */}
      <div className="bg-white shadow-sm p-4 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center">
          {onBackToChat && (
            <button 
              onClick={onBackToChat}
              className="mr-4 text-[#5D4A38] hover:text-[#3A2E22] focus:outline-none"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          <h1 className="text-xl font-semibold text-[#3A2E22]">Quản lý chủ đề</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium text-[#5D4A38]">{topicsCount}</span> chủ đề ·
            <span className="font-medium text-[#5D4A38] ml-1">{messageCount}</span> tin nhắn
          </div>
          
          <div className="flex items-center space-x-2">
            <TailwindTopicSwitcher
              userId={userId}
              currentTopicId={currentTopicId}
              onSelectTopic={onSelectTopic}
              onCreateTopic={handleCreateTopic}
              onEditTopic={handleEditTopic}
            />
            
            <TailwindTopicCreateButton onClick={handleCreateTopic} />
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <TailwindTopicManager
          userId={userId}
          currentTopicId={currentTopicId}
          onSelectTopic={onSelectTopic}
        />
      </div>
      
      {/* Topic Editor Modal */}
      <TailwindTopicEditor
        userId={userId}
        topicToEdit={topicToEdit}
        onSave={handleSaveTopic}
        onCancel={() => setIsEditorOpen(false)}
        isOpen={isEditorOpen}
      />
    </div>
  );
};

export default TailwindTopicPage; 