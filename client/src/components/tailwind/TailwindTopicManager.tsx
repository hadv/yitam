import React, { useState, useEffect } from 'react';
import db, { Topic } from '../../db/ChatHistoryDB';
import TailwindTopicList from './TailwindTopicList';
import TailwindTopicEditor from './TailwindTopicEditor';
import TailwindTopicMetadata from './TailwindTopicMetadata';
import TailwindTopicSearch from './TailwindTopicSearch';

interface TopicManagerProps {
  userId: string;
  currentTopicId?: number;
  onSelectTopic: (topicId: number) => void;
  onTopicDeleted?: (deletedTopicId: number) => void;
}

const TailwindTopicManager: React.FC<TopicManagerProps> = ({
  userId,
  currentTopicId,
  onSelectTopic,
  onTopicDeleted
}) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [topicToEdit, setTopicToEdit] = useState<Topic | undefined>(undefined);
  const [selectedTopicDetails, setSelectedTopicDetails] = useState<Topic | null>(null);
  const [hoveredTopicId, setHoveredTopicId] = useState<number | null>(null);
  const [hoveredTopicDetails, setHoveredTopicDetails] = useState<Topic | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'topics' | 'search'>('topics');

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
        } else {
          console.warn(`[TOPIC DEBUG] Current topic ID ${currentTopicId} not found in database`);
          setSelectedTopicDetails(null);
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

  // Set up a global refresh function that external components can call
  useEffect(() => {
    // Store previous refresh function if it exists
    const prevRefreshFunction = window.refreshTopicList;
    
    // Create a wrapper function that calls our loadTopics but preserves any existing functionality
    const refreshWrapper = () => {
      console.log('[TOPIC MANAGER] Refreshing topic list');
      loadTopics();
      
      // If there was a previous function and it's not ours, call it too
      if (prevRefreshFunction && typeof prevRefreshFunction === 'function' && 
          prevRefreshFunction !== refreshWrapper && prevRefreshFunction !== loadTopics) {
        console.log('[TOPIC MANAGER] Calling previous refresh function');
        prevRefreshFunction();
      }
    };
    
    // Set our wrapper as the global refresh function
    window.refreshTopicList = refreshWrapper;
    
    // Also listen for the custom event for more reliable refreshing
    const handleStorageEvent = () => {
      console.log('[TOPIC MANAGER] Detected refresh event, reloading topics');
      loadTopics();
    };
    
    // Add event listener
    window.addEventListener('storage:refreshTopics', handleStorageEvent);
    
    // Add a function to update a topic's message count in the UI
    window.updateTopicMessageCount = async (topicId: number, newCount: number) => {
      console.log(`[TOPIC UI] Updating topic ${topicId} message count to ${newCount}`);
      
      // Update the local topics array
      setTopics(prevTopics => prevTopics.map(topic => {
        if (topic.id === topicId) {
          return { ...topic, messageCnt: newCount };
        }
        return topic;
      }));
      
      // If this is the currently selected topic, update its details too
      if (selectedTopicDetails && selectedTopicDetails.id === topicId) {
        setSelectedTopicDetails(prev => {
          if (prev) {
            return { ...prev, messageCnt: newCount };
          }
          return prev;
        });
      }
    };
    
    // Clean up when unmounting
    return () => {
      // Only remove our wrapper if it's still the current function
      if (window.refreshTopicList === refreshWrapper) {
        // Restore previous function or delete the property
        if (prevRefreshFunction && prevRefreshFunction !== loadTopics && 
            prevRefreshFunction !== refreshWrapper) {
          window.refreshTopicList = prevRefreshFunction;
        } else {
          delete window.refreshTopicList;
        }
      }
      
      // Remove event listener
      window.removeEventListener('storage:refreshTopics', handleStorageEvent);
      
      // Only remove message count updater if it exists
      if (window.updateTopicMessageCount) {
        delete window.updateTopicMessageCount;
      }
    };
  }, []);
  
  // Update selected topic details when currentTopicId changes
  useEffect(() => {
    if (currentTopicId) {
      console.log(`[TOPIC MANAGER] Current topic ID changed to ${currentTopicId}, fetching details`);
      
      // Fetch the current topic's details
      db.topics.get(currentTopicId)
        .then(topic => {
          if (topic) {
            setSelectedTopicDetails(topic);
          } else {
            console.warn(`[TOPIC MANAGER] Topic ${currentTopicId} not found in database`);
            setSelectedTopicDetails(null);
          }
        })
        .catch(error => {
          console.error(`[TOPIC MANAGER] Error fetching topic ${currentTopicId}:`, error);
          setSelectedTopicDetails(null);
        });
    } else {
      // No current topic ID, clear selected topic details
      setSelectedTopicDetails(null);
    }
  }, [currentTopicId]);
  
  // Load topics on mount
  useEffect(() => {
    loadTopics();
  }, [userId]);

  // Handle topic hover
  useEffect(() => {
    if (hoveredTopicId) {
      db.topics.get(hoveredTopicId)
        .then(topic => {
          if (topic) {
            setHoveredTopicDetails(topic);
          } else {
            setHoveredTopicDetails(null);
          }
        })
        .catch(error => {
          console.error(`[TOPIC MANAGER] Error fetching hovered topic ${hoveredTopicId}:`, error);
          setHoveredTopicDetails(null);
        });
    } else {
      setHoveredTopicDetails(null);
    }
  }, [hoveredTopicId]);

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
      
      // Call the parent component's topic selection handler
      onSelectTopic(topicId);
      
      // Update local state
      const savedTopic = await db.topics.get(topicId);
      if (savedTopic) {
        setSelectedTopicDetails(savedTopic);
      }
      
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
        // Store the deleted topic ID before deletion
        const deletedTopicId = showConfirmDelete;
        
        // Use the new topic deletion method that properly handles all related data
        const result = await db.deleteTopic(deletedTopicId);
        
        if (!result.success) {
          console.error(`[TOPIC MANAGER] Failed to delete topic ${deletedTopicId}`);
          return;
        }
        
        console.log(`[TOPIC MANAGER] Successfully deleted topic ${deletedTopicId} with ${result.deletedMessages} messages`);

        // Enhancement #102: Do not automatically select another topic after deletion
        // Just clear the selected topic details so the user has to explicitly select a topic
        setSelectedTopicDetails(null);
        
        // Update the topics state directly by filtering out the deleted topic
        setTopics(prevTopics => prevTopics.filter(topic => topic.id !== deletedTopicId));
        
        // Notify parent component that a topic was deleted
        if (onTopicDeleted) {
          onTopicDeleted(deletedTopicId);
        }

        // If deleted topic is the current one, pass -1 to the parent to signal deletion
        if (deletedTopicId === currentTopicId) {
          onSelectTopic(-1);
        }
        
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('storage:refreshTopics'));
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

  // Handle topic hover
  const handleTopicHover = (topicId: number | null) => {
    setHoveredTopicId(topicId);
  };

  // Determine the current topic ID for display
  // Always prioritize the prop from parent over local state
  const activeTopicId = currentTopicId || selectedTopicDetails?.id;

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 h-full">
      <div className="md:col-span-3">
        {/* Tab Navigation */}
        <div className="flex mb-4 border-b border-gray-200">
          <button
            className={`py-2 px-4 font-medium text-sm focus:outline-none ${
              activeTab === 'topics'
                ? 'border-b-2 border-[#78A161] text-[#3A2E22]'
                : 'text-gray-500 hover:text-[#3A2E22]'
            }`}
            onClick={() => setActiveTab('topics')}
          >
            Danh sách cuộc trò chuyện
          </button>
          <button
            className={`py-2 px-4 font-medium text-sm focus:outline-none ${
              activeTab === 'search'
                ? 'border-b-2 border-[#78A161] text-[#3A2E22]'
                : 'text-gray-500 hover:text-[#3A2E22]'
            }`}
            onClick={() => setActiveTab('search')}
          >
            Tìm kiếm tin nhắn
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'topics' ? (
          <TailwindTopicList
            userId={userId}
            onSelectTopic={(topicId) => {
              // Call the parent component's topic selection handler
              onSelectTopic(topicId);
              
              // Also update local state for immediate display
              db.topics.get(topicId).then(topic => {
                if (topic) {
                  console.log(`[TOPIC MANAGER] Selected topic ${topicId}, updating local state`);
                  setSelectedTopicDetails(topic);
                } else {
                  console.warn(`[TOPIC MANAGER] Selected topic ${topicId} not found in database`);
                }
              });
            }}
            onCreateTopic={handleCreateTopic}
            onDeleteTopic={handleDeleteTopic}
            onEditTopic={handleEditTopic}
            onTopicHover={handleTopicHover}
            currentTopicId={activeTopicId}
          />
        ) : (
          <TailwindTopicSearch 
            userId={userId}
            onSelectTopic={(topicId) => {
              // Call the parent component's topic selection handler
              onSelectTopic(topicId);
              
              // Also update local state for immediate display
              db.topics.get(topicId).then(topic => {
                if (topic) {
                  console.log(`[TOPIC MANAGER] Selected topic ${topicId} from search, updating local state`);
                  setSelectedTopicDetails(topic);
                  // Switch back to topics tab to show the selected topic
                  setActiveTab('topics');
                } else {
                  console.warn(`[TOPIC MANAGER] Selected topic ${topicId} from search not found in database`);
                }
              });
            }}
            currentTopicId={activeTopicId}
          />
        )}
      </div>
      
      <div className="md:col-span-2">
        {hoveredTopicDetails ? (
          <TailwindTopicMetadata 
            topic={hoveredTopicDetails} 
            className="sticky top-4"
          />
        ) : selectedTopicDetails ? (
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