import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Styles
import '../../styles/animations.css';

// Contexts
import { ConsentProvider } from '../../contexts/ConsentContext';
import { ChatHistoryProvider, useChatHistory } from '../../contexts/ChatHistoryContext';
import { usePersona } from '../../contexts/PersonaContext';

// Custom Hooks
import { useSocket } from '../../hooks/useSocket';
import { useMessages } from '../../hooks/useMessages';
import { useAuth } from '../../hooks/useAuth';
import { useModals } from '../../hooks/useModals';
import useModalSystem from '../../hooks/useModalSystem';
import { useMessageDeletion } from '../../hooks/useMessageDeletion';
import { useDebugFunctions } from '../../hooks/useDebugFunctions';
import { useStorageWindowFunctions } from '../../hooks/useStorageWindowFunctions';

// UI Components
import { TailwindAuth } from './TailwindAuth';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindPersonaSelector from './TailwindPersonaSelector';
import TailwindMessagePersistence, { useMessagePersistence } from './TailwindMessagePersistence';
import TailwindHeader from './TailwindHeader';
import TailwindFooter from './TailwindFooter';
import TailwindMessageDisplay from './TailwindMessageDisplay';
import ModalManager from './common/ModalManager';
import { BetaBanner, ApiKeyWarning } from './TailwindBanners';

// Extracted Components
import GDPRNotification from './notifications/GDPRNotification';
import StorageWarningBanner from './notifications/StorageWarningBanner';
import CacheDebugPanel from '../debug/CacheDebugPanel';

// Utilities
import { decryptApiKey } from '../../utils/encryption';
import { debugIndexedDB, reinitializeDatabase } from '../../db/ChatHistoryDBUtil';
import { checkDatabaseVersionMismatch, updateStoredDatabaseVersion, getSystemInfo } from '../../utils/version';
import { generateTestTopics } from '../../utils/devTestUtils';
import db from '../../db/ChatHistoryDB';
import { sharedConversationService } from '../../services/SharedConversationService';

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
  const [showCacheDebug, setShowCacheDebug] = useState(false);
  const [sharedConversationInfo, setSharedConversationInfo] = useState<{shareId: string, shareUrl: string} | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);



  
  // Get modals state
  const {
    openApiSettings,
    openTopicManager,
    openDataExportImport,
    openStorageSettings,
    openPrivacyControls,
    openPrivacyPolicy,
    openMessageDelete,
    openShareConversation,
    openManageSharedConversations,
    closeModal
  } = useModalSystem();
  
  // Use the old useModals hook just for notifications until we create a notification system
  const { notifications } = useModals();
  
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

  // Check if current conversation is shared
  const checkIfConversationIsShared = useCallback(async (topicId: number) => {
    if (!user?.email) return;

    try {
      // Get the current topic from database to get its title
      const topic = await db.topics.get(topicId);
      if (!topic) {
        setSharedConversationInfo(null);
        return;
      }

      const result = await sharedConversationService.getOwnedConversations(user.email);
      if (result.success && result.conversations) {
        // Find if current topic is in the shared conversations by matching title
        const sharedConv = result.conversations.find(conv =>
          conv.title === topic.title && conv.is_active
        );

        if (sharedConv) {
          setSharedConversationInfo({
            shareId: sharedConv.id,
            shareUrl: `http://localhost:3001/shared/${sharedConv.id}`
          });
        } else {
          setSharedConversationInfo(null);
        }
      }
    } catch (error) {
      console.error('Error checking if conversation is shared:', error);
      setSharedConversationInfo(null);
    }
  }, [user?.email]);

  // Copy shared link to clipboard
  const copySharedLink = async () => {
    if (!sharedConversationInfo) return;

    try {
      await navigator.clipboard.writeText(sharedConversationInfo.shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // Unshare conversation
  const unshareConversation = async () => {
    if (!sharedConversationInfo || !user?.email) return;

    try {
      const result = await sharedConversationService.unshareConversation(
        sharedConversationInfo.shareId,
        user.email
      );

      if (result.success) {
        setSharedConversationInfo(null);
      }
    } catch (error) {
      console.error('Error unsharing conversation:', error);
    }
  };

  // Check if conversation is shared when topic changes
  useEffect(() => {
    if (currentTopicId && messages.length > 1) {
      checkIfConversationIsShared(currentTopicId);
    } else {
      setSharedConversationInfo(null);
    }
  }, [currentTopicId, messages.length, checkIfConversationIsShared]);

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

  // Cache debug panel keyboard shortcut (Ctrl+Shift+C)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        event.preventDefault();
        setShowCacheDebug(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
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

    // Close privacy controls modal using the new system
    closeModal('privacyControls');
    
    // Show in-app notification using the old system
    notifications.dataDeleted.show();

    // Trigger topic list refresh if available
    if (window.triggerTopicListRefresh) {
      window.triggerTopicListRefresh();
    }
  }, [startNewChat, setCurrentTopicId, closeModal, notifications.dataDeleted]);

  // Auto-generate test topics in development mode
  useEffect(() => {
    if (!user || import.meta.env.MODE !== 'development') return;
    
    // Run after a short delay to allow the app to initialize
    setTimeout(() => {
      generateTestTopics(user.email);
    }, 1000);
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
    closeModal('topicManager');
  }, [isTopicEditing, handleTopicSelect, closeModal]);

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
                  onOpenTopicManager={openTopicManager}
                  onOpenApiSettings={openApiSettings}
                  onOpenDataExportImport={openDataExportImport}
                  onOpenStorageSettings={openStorageSettings}
                  onOpenPrivacyControls={openPrivacyControls}
                  onOpenPrivacyPolicy={openPrivacyPolicy}
                  onOpenManageSharedConversations={() => openManageSharedConversations(user?.email)}
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
                  <ApiKeyWarning onSetup={openApiSettings} />
                )}
                
                {/* Storage warning banner for high usage */}
                <StorageWarningBanner 
                  storageUsage={storageUsage} 
                  onOpenStorageSettings={openStorageSettings}
                />
                
                {/* Persona selector container */}
                <div className="flex justify-center md:justify-end px-2 pb-2">
                  <TailwindPersonaSelector socket={socket} />
                </div>

                {/* Sticky conversation header with share/unshare buttons */}
                {messages.length > 1 && currentTopicId && (
                  <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-[#3A2E22]">Cuộc trò chuyện</h3>
                      <p className="text-sm text-[#5D4A38]">
                        {messages.length - 1} tin nhắn
                        {sharedConversationInfo && (
                          <span className="ml-2 text-green-600">• Đã chia sẻ</span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {sharedConversationInfo ? (
                        // Show copy and unshare buttons for shared conversations
                        <>
                          <button
                            onClick={copySharedLink}
                            className={`flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
                              copySuccess
                                ? 'bg-green-500 text-white'
                                : 'text-[#5D4A38] hover:text-[#4A3A2A] hover:bg-gray-100'
                            }`}
                            title="Sao chép liên kết chia sẻ"
                          >
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            {copySuccess ? '✓ Đã sao chép' : 'Sao chép liên kết'}
                          </button>
                          <button
                            onClick={unshareConversation}
                            className="flex items-center px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                            title="Hủy chia sẻ cuộc trò chuyện"
                          >
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Hủy chia sẻ
                          </button>
                        </>
                      ) : (
                        // Show share button for non-shared conversations
                        <button
                          onClick={() => openShareConversation(currentTopicId)}
                          className="flex items-center px-3 py-2 text-sm text-[#5D4A38] hover:text-[#4A3A2A] hover:bg-gray-100 rounded-md transition-colors"
                          title="Chia sẻ cuộc trò chuyện"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                          </svg>
                          Chia sẻ
                        </button>
                      )}
                    </div>
                  </div>
                )}

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
                      onDeleteMessage={(messageId) => {
                        handleDeleteMessage(messageId);
                        openMessageDelete(messageId);
                      }}
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

              {/* All modals */}
              <ModalManager
                socket={socket}
                user={user}
                currentTopicId={currentTopicId}
                isTopicEditing={isTopicEditing}
                storageUsage={storageUsage}
                connectSocket={connectSocket}
                handleSafeTopicSelect={handleSafeTopicSelect}
                handleTopicEditStart={handleTopicEditStart}
                handleTopicEditEnd={handleTopicEditEnd}
                startNewChat={startNewChat}
                setCurrentTopicId={setCurrentTopicId}
                confirmDeleteMessage={confirmDeleteMessage}
                handleDataDeleted={handleDataDeleted}
                onConversationShared={() => {
                  // Refresh shared conversation info when a conversation is shared
                  if (currentTopicId) {
                    checkIfConversationIsShared(currentTopicId);
                  }
                }}
              />

              {/* Cache Debug Panel */}
              <CacheDebugPanel
                isOpen={showCacheDebug}
                onClose={() => setShowCacheDebug(false)}
              />
            </div>
          </TailwindMessagePersistence>
        </ChatHistoryProvider>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 