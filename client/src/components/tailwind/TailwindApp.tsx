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
import TailwindModalManager from './TailwindModalManager';
import { BetaBanner, ApiKeyWarning } from './TailwindBanners';

// Extracted Components
import GDPRNotification from './notifications/GDPRNotification';
import StorageWarningBanner from './notifications/StorageWarningBanner';

// Utilities
import { decryptApiKey } from '../../utils/encryption';
import { debugIndexedDB, reinitializeDatabase } from '../../db/ChatHistoryDBUtil';
import { checkDatabaseVersionMismatch, updateStoredDatabaseVersion, getSystemInfo } from '../../utils/version';
import { generateTestTopics } from '../../utils/devTestUtils';
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
              <TailwindModalManager
                modals={modals}
                socket={socket}
                user={user}
                currentTopicId={currentTopicId}
                isTopicEditing={isTopicEditing}
                storageUsage={storageUsage}
                messageToDelete={messageToDelete}
                connectSocket={connectSocket}
                handleSafeTopicSelect={handleSafeTopicSelect}
                handleTopicEditStart={handleTopicEditStart}
                handleTopicEditEnd={handleTopicEditEnd}
                startNewChat={startNewChat}
                setCurrentTopicId={setCurrentTopicId}
                confirmDeleteMessage={confirmDeleteMessage}
                cancelDeleteMessage={cancelDeleteMessage}
                handleDataDeleted={handleDataDeleted}
              />
            </div>
          </TailwindMessagePersistence>
        </ChatHistoryProvider>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 