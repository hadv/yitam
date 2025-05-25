// Add this at the top of the file, before the imports
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
  }
}

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

// UI Components
import { TailwindAuth } from './TailwindAuth';
import { TailwindApiKeySettings } from './TailwindApiKeySettings';
import TailwindChatBox from './TailwindChatBox';
import TailwindMessageInput from './TailwindMessageInput';
import TailwindSampleQuestions from './TailwindSampleQuestions';
import TailwindTermsModal from './TailwindTermsModal';
import TailwindPersonaSelector from './TailwindPersonaSelector';
import TailwindTopicManager from './TailwindTopicManager';
import TailwindMessagePersistence from './TailwindMessagePersistence';
import TailwindHeader from './TailwindHeader';
import TailwindFooter from './TailwindFooter';
import TailwindMessageDisplay from './TailwindMessageDisplay';
import TailwindModal from './TailwindModal';
import { BetaBanner, ApiKeyWarning } from './TailwindBanners';

// Utilities
import { decryptApiKey } from '../../utils/encryption';
import { debugIndexedDB, reinitializeDatabase } from '../../db/ChatHistoryDBUtil';
import { checkDatabaseVersionMismatch, updateStoredDatabaseVersion, getSystemInfo } from '../../utils/version';
import { extractTitleFromBotText } from '../../utils/titleExtraction';
import { setupWindowDebugFunctions } from '../../utils/debugging';

// Types
import { UserData, Message } from '../../types/chat';

function TailwindApp() {
  // User state
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  // UI state
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [questionsLimit] = useState(6);
  const inputRef = useRef<HTMLDivElement>(null);
  
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
    createNewTopic
  } = useMessages(socket, user);

  // Check if any bot message is currently streaming
  const isBotResponding = messages.some(msg => msg.isBot && msg.isStreaming);

  // Set up debug functions on the window object
  useEffect(() => {
    const cleanup = setupWindowDebugFunctions(
      () => currentPersonaId,
      absoluteForcePersona,
      undefined, // debugPersonaSystem
      undefined, // checkTopicPersonaConsistency
      undefined, // fixTopicPersonas
      undefined, // exportTopic
      (text: string) => extractTitleFromBotText(text)
    );
    
    return cleanup;
  }, [currentPersonaId, absoluteForcePersona]);

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
        const loadingMessage: Message = {
          id: `system-${Date.now()}`,
          text: 'Phiên bản cơ sở dữ liệu đã thay đổi. Đang cập nhật hệ thống... vui lòng đợi trong giây lát.',
          isBot: true
        };
        
        // Reset the database
        const success = await reinitializeDatabase();
        
        if (success) {
          // Update stored version
          updateStoredDatabaseVersion();
        }
      }
      
      // Log system info for debugging
      getSystemInfo();
    };
    
    checkDbVersion();
  }, []);

  // Auth success handler
  const handleAuthSuccess = useCallback((userData: UserData) => {
    // Store user data
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  // Logout handler
  const handleLogout = useCallback(() => {
    // Disconnect socket
    disconnect();
    
    // Clear user data
    localStorage.removeItem('user');
    setUser(null);
    
    // Reset state
    startNewChat();
  }, [disconnect, startNewChat]);

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

  if (!user) {
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
                  onLogout={handleLogout}
                  onOpenTopicManager={() => setShowTopicManager(true)}
                  onOpenApiSettings={() => setShowApiSettings(true)}
                />
                
                {/* Beta warning banner */}
                <BetaBanner />
                
                {/* API Key warning banner */}
                {!hasStoredApiKey() && (
                  <ApiKeyWarning onSetup={() => setShowApiSettings(true)} />
                )}
                
                {/* Persona selector container */}
                <div className="flex justify-center md:justify-end px-2 pb-2">
                  <TailwindPersonaSelector socket={socket} />
                </div>

                {/* Scrollable chat area - takes remaining height */}
                <div className="flex-1 overflow-y-auto my-[10px] pb-[80px] relative bg-white/50 rounded-lg">
                  {/* Chat display */}
                  <div id="yitam-chat-container" className="flex flex-col p-2.5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] chat-messages-container">
                    <TailwindMessageDisplay 
                      messages={messages}
                      currentPersonaId={currentPersonaId}
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
                isOpen={showApiSettings}
                onClose={() => setShowApiSettings(false)}
              >
                <TailwindApiKeySettings 
                  onApiKeySet={() => {
                    setShowApiSettings(false);
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
                isOpen={showTopicManager}
                onClose={() => setShowTopicManager(false)}
                title="Quản lý cuộc trò chuyện"
                maxWidth="max-w-5xl"
                fullHeight={true}
              >
                <div className="p-6">
                  <TailwindTopicManager
                    userId={user.email}
                    currentTopicId={currentTopicId}
                    onSelectTopic={(topicId: number) => {
                      handleTopicSelect(topicId);
                      setShowTopicManager(false);
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
            </div>
          </TailwindMessagePersistence>
        </ChatHistoryProvider>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 