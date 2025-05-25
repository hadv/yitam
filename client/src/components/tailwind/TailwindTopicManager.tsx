import React, { useState, useEffect } from 'react';
import db, { Topic } from '../../db/ChatHistoryDB';
import TailwindTopicList from './TailwindTopicList';
import TailwindTopicEditor from './TailwindTopicEditor';
import TailwindTopicMetadata from './TailwindTopicMetadata';

interface TopicManagerProps {
  userId: string;
  currentTopicId?: number;
  onSelectTopic: (topicId: number) => void;
}

const TailwindTopicManager: React.FC<TopicManagerProps> = ({
  userId,
  currentTopicId,
  onSelectTopic
}) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [topicToEdit, setTopicToEdit] = useState<Topic | undefined>(undefined);
  const [selectedTopicDetails, setSelectedTopicDetails] = useState<Topic | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load topics from database
  const loadTopics = async () => {
    try {
      setIsLoading(true);
      const userTopics = await db.topics
        .where('userId')
        .equals(userId)
        .toArray();
      setTopics(userTopics);

      // If we have a current topic ID, fetch its details
      if (currentTopicId) {
        const currentTopic = await db.topics.get(currentTopicId);
        if (currentTopic) {
          setSelectedTopicDetails(currentTopic);
        }
      } else if (userTopics.length > 0) {
        // Auto-select the most recent topic by default if no topic is selected
        const sortedTopics = [...userTopics].sort((a, b) => b.lastActive - a.lastActive);
        const mostRecentTopic = sortedTopics[0];
        if (mostRecentTopic && mostRecentTopic.id) {
          setSelectedTopicDetails(mostRecentTopic);
        }
      } else {
        setSelectedTopicDetails(null);
      }
    } catch (error) {
      console.error('Error loading topics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load topics on mount and when current topic changes
  useEffect(() => {
    loadTopics();
  }, [userId, currentTopicId]);

  // Handle creating a new topic
  const handleCreateTopic = () => {
    setTopicToEdit(undefined);
    setIsEditorOpen(true);
  };

  // Handle editing an existing topic
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

      // Reload topics and switch to the saved topic
      await loadTopics();
      onSelectTopic(topicId);
      setIsEditorOpen(false);
    } catch (error) {
      console.error('Error saving topic:', error);
    }
  };

  // Handle deleting a topic
  const handleDeleteTopic = async (topicId: number) => {
    setShowConfirmDelete(topicId);
  };

  // Confirm deletion of a topic
  const confirmDeleteTopic = async () => {
    if (showConfirmDelete) {
      try {
        // First delete all messages for this topic
        await db.messages
          .where('topicId')
          .equals(showConfirmDelete)
          .delete();

        // Then delete the topic itself
        await db.topics.delete(showConfirmDelete);

        // Find another topic to select
        const otherTopics = topics.filter(t => t.id !== showConfirmDelete);
        if (otherTopics.length > 0) {
          // Sort by most recently active
          const sortedTopics = [...otherTopics].sort((a, b) => b.lastActive - a.lastActive);
          const newTopicToSelect = sortedTopics[0];
          if (newTopicToSelect && newTopicToSelect.id) {
            setSelectedTopicDetails(newTopicToSelect);
            onSelectTopic(newTopicToSelect.id);
          } else {
            setSelectedTopicDetails(null);
          }
        } else {
          // No topics left, just reset the UI without creating a new topic
          setSelectedTopicDetails(null);
          // Use -1 as a special value to indicate no topics
          onSelectTopic(-1);
        }

        // Reload topics to update the list
        await loadTopics();
      } catch (error) {
        console.error('Error deleting topic:', error);
      }
    }
    setShowConfirmDelete(null);
  };

  // Cancel deletion
  const cancelDeleteTopic = () => {
    setShowConfirmDelete(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 h-full">
      <div className="md:col-span-3">
        <TailwindTopicList
          userId={userId}
          onSelectTopic={(topicId) => {
            onSelectTopic(topicId);
            // Also update local state for immediate display
            db.topics.get(topicId).then(topic => {
              if (topic) setSelectedTopicDetails(topic);
            });
          }}
          onCreateTopic={handleCreateTopic}
          onDeleteTopic={handleDeleteTopic}
          onEditTopic={handleEditTopic}
          currentTopicId={selectedTopicDetails?.id || currentTopicId}
        />
      </div>
      
      <div className="md:col-span-2">
        {selectedTopicDetails ? (
          <TailwindTopicMetadata 
            topic={selectedTopicDetails} 
            className="sticky top-4"
          />
        ) : (
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-gray-500">
              Chọn một chủ đề để xem chi tiết
            </p>
          </div>
        )}
      </div>

      {/* Topic Editor Modal */}
      <TailwindTopicEditor
        userId={userId}
        topicToEdit={topicToEdit}
        onSave={handleSaveTopic}
        onCancel={() => setIsEditorOpen(false)}
        isOpen={isEditorOpen}
      />

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-[#3A2E22] mb-4">Xác nhận xóa</h3>
            <p className="text-gray-600 mb-6">
              Bạn có chắc chắn muốn xóa chủ đề này? Tất cả tin nhắn thuộc chủ đề này sẽ bị xóa vĩnh viễn.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDeleteTopic}
                className="px-4 py-2 border border-gray-300 rounded-md text-[#3A2E22] hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={confirmDeleteTopic}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TailwindTopicManager; 