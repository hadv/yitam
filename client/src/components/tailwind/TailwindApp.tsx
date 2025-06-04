import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { config } from '../../config';
import * as ReactDOM from 'react-dom';

// Contexts
import { ConsentProvider } from '../../contexts/ConsentContext';
import { ChatHistoryProvider, useChatHistory } from '../../contexts/ChatHistoryContext';
import { usePersona } from '../../contexts/PersonaContext';

// Custom Hooks
import { useSocket } from '../../hooks/useSocket';
import { useMessages } from '../../hooks/useMessages';
import { useAuth } from '../../hooks/useAuth';
import { useModals } from '../../hooks/useModals';
import { useMessageDeletion } from '../../hooks/useMessageDeletion';
import { useDebugFunctions } from '../../hooks/useDebugFunctions';
import { useStorageWindowFunctions } from '../../hooks/useStorageWindowFunctions';

// UI Components
import { TailwindAuth } from './TailwindAuth';
import { TailwindApiKeySettings } from './TailwindApiKeySettings';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindPersonaSelector from './TailwindPersonaSelector';
import TailwindTopicManager from './TailwindTopicManager';
import TailwindMessagePersistence, { useMessagePersistence } from './TailwindMessagePersistence';
import TailwindHeader from './TailwindHeader';
import TailwindFooter from './TailwindFooter';
import TailwindMessageDisplay from './TailwindMessageDisplay';
import TailwindModal from './TailwindModal';
import TailwindDataExportImport from './TailwindDataExportImport';
import TailwindPrivacyControls from './TailwindPrivacyControls';
import TailwindPrivacyPolicy from './TailwindPrivacyPolicy';
import { BetaBanner, ApiKeyWarning } from './TailwindBanners';

// Extracted Components
import TailwindStorageSettings from './settings/TailwindStorageSettings';
import GDPRNotification from './notifications/GDPRNotification';
import StorageWarningBanner from './notifications/StorageWarningBanner';
import MessageDeleteModal from './modals/MessageDeleteModal';

// Utilities
import { decryptApiKey } from '../../utils/encryption';
import { debugIndexedDB, reinitializeDatabase } from '../../db/ChatHistoryDBUtil';
import { checkDatabaseVersionMismatch, updateStoredDatabaseVersion, getSystemInfo } from '../../utils/version';
import db from '../../db/ChatHistoryDB';

// Global type declarations
declare global {
  interface Window {
    getCurrentPersonaId?: () => string;
    absoluteForcePersona?: (personaId: string) => void;
    debugPersonaSystem?: () => Promise<any>;
    checkTopicPersonaConsistency?: () => Promise<any>;
    fixTopicPersonas?: (defaultPersona?: string) => Promise<any>;
    exportTopic?: (topicId: number) => Promise<any>;
    testTitleExtraction?: (text: string) => string;
    lastUsedPersona?: string;
    refreshTopicList?: () => void;
    updateTopicMessageCount?: (topicId: number, count: number) => void;
    triggerTopicListRefresh?: () => void;
    // Add search debug functions
    reindexAllMessages?: (userId: string) => Promise<boolean>;
    reindexCurrentTopic?: () => Promise<boolean>;
    getSearchStats?: () => Promise<any>;
    searchMessages?: (query: string, filters?: any) => Promise<any>;
    // Add storage management functions
    compressMessages?: (topicId?: number) => Promise<any>;
    setStorageRetentionPolicy?: (days: number) => void;
    cleanupOldestConversations?: (keepCount?: number) => Promise<any>;
    cleanupOrphanedData?: () => Promise<any>;
    // Add performance optimization functions
    benchmarkOperations?: () => Promise<any>;
    optimizeDatabasePerformance?: () => Promise<any>;
    analyzeStorage?: () => Promise<any>;
  }
}

function TailwindApp() {
  // Get the auth state
  const { user, isAuthenticated, handleAuthSuccess, handleLogout } = useAuth();
  
  // UI state
  const inputRef = useRef<HTMLDivElement>(null);
  const [questionsLimit] = useState(6);
  const [isTopicEditing, setIsTopicEditing] = useState(false);
  
  // Get modals state
  const { modals, notifications } = useModals();
  
  // Get context hooks
  const { isDBReady, dbError, storageUsage, forceDBInit } = useChatHistory();
  const { 
    currentPersonaId,
    setCurrentPersonaId,
    isPersonaLocked,
    setIsPersonaLocked,
    resetPersona,
    forceSetPersona,
    absoluteForcePersona
  } = usePersona();
  
  // Message persistence hook
  const { deleteMessage } = useMessagePersistence();
  
  // Custom hooks
  const { socket, isConnected, connectSocket, disconnect } = useSocket(user);
  const { 
    messages, 
    hasUserSentMessage, 
    setHasUserSentMessage,
    currentTopicId,
    sendMessage,
    startNewChat,
    handleTopicSelect,
    createNewTopic,
    setMessages,
    setCurrentTopicId
  } = useMessages(socket, user);
  
  // Message deletion hook
  const {
    messageToDelete,
    handleDeleteMessage,
    confirmDeleteMessage,
    cancelDeleteMessage
  } = useMessageDeletion(messages, setMessages, currentTopicId, startNewChat, setCurrentTopicId);

  // Setup debug functions
  useDebugFunctions(
    () => currentPersonaId,
    absoluteForcePersona,
    user,
    currentTopicId
  );
  
  // Setup storage window functions
  useStorageWindowFunctions(user?.email);

  // Check if any bot message is currently streaming
  const isBotResponding = messages.some(msg => msg.isBot && msg.isStreaming);

  // Component mount effect - debug IndexedDB
  useEffect(() => {
    const debugDB = async () => {
      const isAvailable = await debugIndexedDB();
      
      if (!isAvailable) {
        await reinitializeDatabase();
      }
    };
    
    debugDB();
  }, []);

  // Component mount effect - check database version and reset if needed
  useEffect(() => {
    const checkDbVersion = async () => {
      // Check if current DB version matches stored version
      if (checkDatabaseVersionMismatch()) {
        // Show a loading message
        // Reset the database
        const success = await reinitializeDatabase();
        
        if (success) {
          // Update stored version
          updateStoredDatabaseVersion();
        }
      }
      
      // Log system info for debugging
      getSystemInfo();
      
      // Perform database cleanup to ensure consistency
      try {
        console.log('[APP] Running database cleanup to ensure data consistency');
        const cleanupResult = await db.cleanupOrphanedData();
        console.log('[APP] Database cleanup results:', cleanupResult);
      } catch (cleanupError) {
        console.error('[APP] Error during database cleanup:', cleanupError);
      }
    };
    
    checkDbVersion();
  }, []);

  // Initialize the database as early as possible
  useEffect(() => {
    forceDBInit().then(isReady => {
      console.log(`[DB DEBUG] Database initialization result: ${isReady}`);
      
      // If still not ready after our attempt, show a warning
      if (!isReady && !isDBReady) {
        console.warn('[DB DEBUG] Database still not ready after initialization attempt');
      }
    });
  }, [forceDBInit, isDBReady]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    const chatContainer = document.getElementById('yitam-chat-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);

  // Check if API key is stored
  const hasStoredApiKey = () => {
    const apiKey = decryptApiKey();
    return !!apiKey;
  };

  // Lazy loading scroll handler for improved performance
  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    // This function could be improved for virtual scrolling in the future
  }, []);
  
  // Handle data deletion
  const handleDataDeleted = useCallback(() => {
    // Reset state after data deletion
    startNewChat();
    setCurrentTopicId(undefined);

    // Close privacy controls modal
    modals.privacyControls.close();
    
    // Show in-app notification
    notifications.dataDeleted.show();

    // Trigger topic list refresh if available
    if (window.triggerTopicListRefresh) {
      window.triggerTopicListRefresh();
    }
  }, [startNewChat, setCurrentTopicId, modals.privacyControls, notifications.dataDeleted]);

  // Auto-generate test topics in development mode
  useEffect(() => {
    if (!user || import.meta.env.MODE !== 'development') return;
    
    const generateTestTopics = async () => {
      try {
        // Check if user has any topics
        const topicCount = await db.topics
          .where('userId').equals(user.email)
          .count();
        
        if (topicCount > 0) {
          console.log(`[DEV] User already has ${topicCount} topics, skipping test data generation`);
          return;
        }
        
        console.log('[DEV] No topics found, generating 100 test topics with diverse timestamps');
        
        // Define time periods for test data
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000; // 1 day in milliseconds
        const hour = 60 * 60 * 1000; // 1 hour in milliseconds
        const minute = 60 * 1000; // 1 minute in milliseconds
        
        // Timestamp distribution:
        // 10 from today (including very recent ones in minutes)
        // 10 from yesterday
        // 20 from this week (2-7 days ago)
        // 20 from last week (7-14 days ago)
        // 20 from this month (14-30 days ago)
        // 10 from last month (30-60 days ago)
        // 10 older than 60 days
        
        // Generate topics with timestamps distributed across different time periods
        for (let i = 1; i <= 100; i++) {
          let timestamp;
          let title = `Test Topic ${i}`;
          let isPinned = false;
          
          // Assign timestamps based on index
          if (i <= 10) { 
            // Today (0-24 hours ago) - including very recent ones
            const hoursAgo = Math.floor(Math.random() * 24);
            
            if (hoursAgo < 1) {
              // Very recent (within last hour)
              const minutesAgo = Math.floor(Math.random() * 59) + 1;
              timestamp = now - (minutesAgo * minute);
              title = `Just now topic - ${minutesAgo} minutes ago`;
            } else {
              timestamp = now - (hoursAgo * hour);
              title = `Today topic - ${hoursAgo} hours ago`;
            }
            
            // Make some topics pinned
            isPinned = i <= 3;
          } 
          else if (i <= 20) { 
            // Yesterday
            const hoursAgo = 24 + Math.floor(Math.random() * 24);
            timestamp = now - (hoursAgo * hour);
            title = `Yesterday topic ${i-10}`;
          } 
          else if (i <= 40) { 
            // This week (2-7 days ago)
            const daysAgo = 2 + Math.floor(Math.random() * 5);
            timestamp = now - (daysAgo * day);
            title = `This week topic ${i-20}`;
            
            // Make some topics pinned
            isPinned = i <= 23;
          } 
          else if (i <= 60) { 
            // Last week (7-14 days ago)
            const daysAgo = 7 + Math.floor(Math.random() * 7);
            timestamp = now - (daysAgo * day);
            title = `Last week topic ${i-40}`;
          } 
          else if (i <= 80) { 
            // This month (14-30 days ago)
            const daysAgo = 14 + Math.floor(Math.random() * 16);
            timestamp = now - (daysAgo * day);
            title = `This month topic ${i-60}`;
          } 
          else if (i <= 90) { 
            // Last month (30-60 days ago)
            const daysAgo = 30 + Math.floor(Math.random() * 30);
            timestamp = now - (daysAgo * day);
            title = `Last month topic ${i-80}`;
          } 
          else { 
            // Older (60+ days ago)
            const daysAgo = 60 + Math.floor(Math.random() * 180); // Up to 8 months old
            timestamp = now - (daysAgo * day);
            title = `Old topic ${i-90}`;
          }
          
          // Create topic
          const topicId = await db.topics.add({
            userId: user.email,
            title: title,
            createdAt: timestamp,
            lastActive: timestamp,
            messageCnt: 2,
            userMessageCnt: 1,
            assistantMessageCnt: 1,
            personaId: 'traditional-medicine', // Default persona
            pinnedState: isPinned
          });
          
          // Add user message
          await db.messages.add({
            topicId: topicId as number,
            timestamp: timestamp,
            role: 'user',
            content: `This is test message ${i} from user. For testing performance and storage functionality.`
          });
          
          // Add bot response
          await db.messages.add({
            topicId: topicId as number,
            timestamp: timestamp + 5000,
            role: 'assistant',
            content: `This is test response ${i} from assistant. This simulates a response to the user's query about traditional medicine. The response is intentionally kept short for test purposes, but in a real scenario, these messages could be much longer and would benefit from compression.`
          });
          
          // Log progress at intervals
          if (i % 10 === 0) {
            console.log(`[DEV] Generated ${i}/100 test topics`);
          }
        }
        
        console.log('[DEV] Successfully generated 100 test topics with diverse timestamps');
        
        // Refresh topic list if needed
        if (window.triggerTopicListRefresh) {
          window.triggerTopicListRefresh();
        }
      } catch (error) {
        console.error('[DEV] Error generating test topics:', error);
      }
    };
    
    // Run after a short delay to allow the app to initialize
    setTimeout(generateTestTopics, 1000);
  }, [user]);

  // Handle topic edit mode
  const handleTopicEditStart = useCallback(() => {
    setIsTopicEditing(true);
  }, []);

  const handleTopicEditEnd = useCallback(() => {
    // Use setTimeout to ensure the editing operation completes
    // before resetting state
    setTimeout(() => {
      setIsTopicEditing(false);
      // Refresh topic list if needed
      if (window.triggerTopicListRefresh) {
        window.triggerTopicListRefresh();
      }
    }, 100);
  }, []);

  // Handle topic selection with edit mode awareness
  const handleSafeTopicSelect = useCallback((topicId: number) => {
    // If we're in editing mode, don't select the topic to avoid navigation
    if (isTopicEditing) {
      return;
    }
    
    // Check if the topicId is -1, which is a special value indicating no topics
    // or when a topic was deleted but we don't want to select another automatically
    if (topicId === -1) {
      // Just stay on the topic manager page without selecting a topic
      return;
    }
    
    // Normal topic selection
    handleTopicSelect(topicId);
    modals.topicManager.close();
  }, [isTopicEditing, handleTopicSelect, modals.topicManager]);

  // Rendering logic
  if (!isAuthenticated) {
    return (
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <TailwindAuth onAuthSuccess={handleAuthSuccess} />
      </GoogleOAuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <ConsentProvider>
        <ChatHistoryProvider>
          <TailwindMessagePersistence>
            <div className="h-screen bg-[#FDFBF6] text-[#3A2E22] flex justify-center overflow-hidden">
              <div className="w-full max-w-[1000px] flex flex-col h-screen p-2 overflow-hidden">
                {/* Header */}
                <TailwindHeader 
                  user={user}
                  onLogout={() => {
                    disconnect();
                    handleLogout();
                    startNewChat();
                  }}
                  onOpenTopicManager={modals.topicManager.open}
                  onOpenApiSettings={modals.apiSettings.open}
                  onOpenDataExportImport={modals.dataExportImport.open}
                  onOpenStorageSettings={modals.storageSettings.open}
                  onOpenPrivacyControls={modals.privacyControls.open}
                  onOpenPrivacyPolicy={modals.privacyPolicy.open}
                />
                
                {/* GDPR data deleted notification */}
                <GDPRNotification 
                  show={notifications.dataDeleted.isVisible}
                  onClose={notifications.dataDeleted.hide}
                />
                
                {/* Beta warning banner */}
                <BetaBanner />
                
                {/* API Key warning banner */}
                {!hasStoredApiKey() && (
                  <ApiKeyWarning onSetup={modals.apiSettings.open} />
                )}
                
                {/* Storage warning banner for high usage */}
                <StorageWarningBanner 
                  storageUsage={storageUsage} 
                  onOpenStorageSettings={modals.storageSettings.open}
                />
                
                {/* Persona selector container */}
                <div className="flex justify-center md:justify-end px-2 pb-2">
                  <TailwindPersonaSelector socket={socket} />
                </div>

                {/* Scrollable chat area - takes remaining height */}
                <div 
                  className="flex-1 overflow-y-auto my-[10px] pb-[80px] relative bg-white/50 rounded-lg"
                  onScroll={handleChatScroll}
                >
                  {/* Chat display */}
                  <div id="yitam-chat-container" className="flex flex-col p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] chat-messages-container">
                    <TailwindMessageDisplay 
                      messages={messages}
                      currentPersonaId={currentPersonaId}
                      onDeleteMessage={handleDeleteMessage}
                      pageSize={30} // Default value, could be made configurable
                    />
                  </div>
                  
                  {/* Show sample questions when appropriate */}
                  {messages.length === 1 && messages[0].id === 'welcome' && !hasUserSentMessage && (
                    <TailwindSampleQuestions 
                      onQuestionClick={(question) => {
                        console.log('Sample question clicked:', question);
                        sendMessage(question);
                      }} 
                      socket={socket} 
                      limit={questionsLimit}
                    />
                  )}
                </div>

                {/* CSS for the dots animation */}
                <style>{`
                  .typing-dot {
                    display: inline-block;
                    width: 6px;
                    height: 6px;
                    margin: 0 2px;
                    background-color: #777;
                    border-radius: 50%;
                    animation: typing-animation 1.4s infinite ease-in-out both;
                  }
                  
                  .typing-dot:nth-child(1) {
                    animation-delay: 0s;
                  }
                  
                  .typing-dot:nth-child(2) {
                    animation-delay: 0.2s;
                  }
                  
                  .typing-dot:nth-child(3) {
                    animation-delay: 0.4s;
                  }
                  
                  @keyframes typing-animation {
                    0%, 80%, 100% { 
                      transform: scale(0.6);
                      opacity: 0.6;
                    }
                    40% { 
                      transform: scale(1);
                      opacity: 1;
                    }
                  }
                  
                  @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(-10px); }
                    10% { opacity: 1; transform: translateY(0); }
                    90% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-10px); }
                  }
                  .animate-fade-in-out {
                    animation: fadeInOut 5s ease-in-out;
                  }
                `}</style>

                {/* Message input - fixed at bottom */}
                <div 
                  ref={inputRef} 
                  className="sticky bottom-0 bg-[#FDFBF6] pt-2 z-10 w-full transition-all duration-300 ease-in-out"
                >
                  <TailwindMessageInput 
                    onSendMessage={(text) => {
                      console.log('Message input:', text);
                      sendMessage(text);
                    }} 
                    disabled={!isConnected} 
                  />
                  
                  {/* Footer */}
                  <TailwindFooter 
                    isConnected={isConnected}
                    hasMessages={messages.length > 1}
                    isBotResponding={isBotResponding}
                    onStartNewChat={startNewChat}
                  />
                </div>
              </div>

              {/* API Settings Modal */}
              <TailwindModal 
                isOpen={modals.apiSettings.isOpen}
                onClose={modals.apiSettings.close}
              >
                <TailwindApiKeySettings 
                  onApiKeySet={() => {
                    modals.apiSettings.close();
                    // Reconnect socket with new API key
                    if (user) {
                      connectSocket(user);
                    }
                  }}
                  socket={socket || undefined}
                />
              </TailwindModal>
              
              {/* Topic Manager Modal */}
              <TailwindModal
                isOpen={modals.topicManager.isOpen}
                onClose={modals.topicManager.close}
                title="Quản lý cuộc trò chuyện"
                maxWidth="max-w-5xl"
                fullHeight={true}
              >
                <div className="p-6">
                  <TailwindTopicManager
                    userId={user?.email || ''}
                    currentTopicId={currentTopicId}
                    onSelectTopic={handleSafeTopicSelect}
                    onTopicEditStart={handleTopicEditStart}
                    onTopicEditEnd={handleTopicEditEnd}
                    isEditing={isTopicEditing}
                    onTopicDeleted={(deletedTopicId: number) => {
                      // If the deleted topic is the currently selected one
                      if (deletedTopicId === currentTopicId) {
                        startNewChat();
                        setCurrentTopicId(undefined);
                      }
                      
                      // Ensure the topic list is refreshed, but only trigger once
                      if (window.triggerTopicListRefresh) {
                        window.triggerTopicListRefresh();
                      }
                    }}
                  />
                </div>
                
                {storageUsage && storageUsage.percentage > 0 && (
                  <div className="p-5 border-t border-[#E6DFD1]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[#5D4A38]">
                        Dung lượng lưu trữ: {(storageUsage.usage / (1024 * 1024)).toFixed(1)} MB / {(storageUsage.quota / (1024 * 1024)).toFixed(1)} MB
                      </span>
                      <span className={`text-sm font-medium ${
                        storageUsage.percentage > 80 ? 'text-red-600' : 
                        storageUsage.percentage > 60 ? 'text-amber-600' : 'text-[#78A161]'
                      }`}>
                        {storageUsage.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          storageUsage.percentage > 80 ? 'bg-red-500' : 
                          storageUsage.percentage > 60 ? 'bg-amber-500' : 'bg-[#78A161]'
                        }`}
                        style={{ width: `${Math.min(100, storageUsage.percentage)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </TailwindModal>
              
              {/* Data Export/Import Modal */}
              <TailwindModal
                isOpen={modals.dataExportImport.isOpen}
                onClose={modals.dataExportImport.close}
                title="Xuất/Nhập dữ liệu"
                maxWidth="max-w-4xl"
              >
                <TailwindDataExportImport
                  userId={user?.email || ''}
                  currentTopicId={currentTopicId}
                  onClose={modals.dataExportImport.close}
                />
              </TailwindModal>
              
              {/* Storage Settings Modal */}
              <TailwindModal
                isOpen={modals.storageSettings.isOpen}
                onClose={modals.storageSettings.close}
                title="Quản lý dung lượng lưu trữ"
                maxWidth="max-w-4xl"
              >
                <TailwindStorageSettings
                  userId={user?.email || ''}
                  onClose={modals.storageSettings.close}
                />
              </TailwindModal>
              
              {/* Message Delete Confirmation Modal */}
              <MessageDeleteModal
                messageId={messageToDelete}
                onConfirm={confirmDeleteMessage}
                onCancel={cancelDeleteMessage}
              />
              
              {/* Privacy Controls Modal */}
              <TailwindModal
                isOpen={modals.privacyControls.isOpen}
                onClose={modals.privacyControls.close}
                title="Quyền riêng tư & Kiểm soát dữ liệu"
                maxWidth="max-w-4xl"
              >
                <TailwindPrivacyControls 
                  userId={user?.email || ''}
                  onDataDeleted={handleDataDeleted}
                />
                <div className="flex justify-center pt-4 pb-2">
                  <button
                    onClick={() => {
                      modals.privacyControls.close();
                      modals.privacyPolicy.open();
                    }}
                    className="px-4 py-2 text-[#78A161] hover:text-[#5D8A46] font-medium"
                  >
                    Xem chính sách quyền riêng tư
                  </button>
                </div>
              </TailwindModal>
              
              {/* Privacy Policy Modal */}
              <TailwindModal
                isOpen={modals.privacyPolicy.isOpen}
                onClose={modals.privacyPolicy.close}
                title="Chính sách quyền riêng tư"
                maxWidth="max-w-6xl"
                fullHeight={false}
                scrollable={true}
              >
                <TailwindPrivacyPolicy />
              </TailwindModal>
            </div>
          </TailwindMessagePersistence>
        </ChatHistoryProvider>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 