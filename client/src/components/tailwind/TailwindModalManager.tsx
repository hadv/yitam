import React from 'react';

// UI Components
import TailwindModal from './TailwindModal';
import { TailwindApiKeySettings } from './TailwindApiKeySettings';
import TailwindTopicManager from './TailwindTopicManager';
import TailwindDataExportImport from './TailwindDataExportImport';
import TailwindPrivacyControls from './TailwindPrivacyControls';
import TailwindPrivacyPolicy from './TailwindPrivacyPolicy';
import TailwindStorageSettings from './settings/TailwindStorageSettings';
import MessageDeleteModal from './modals/MessageDeleteModal';

// Types
import { Socket } from 'socket.io-client';
import { UserData } from '../../types/chat';

// Define ModalsState type based on useModals hook
interface ModalControl {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export interface ModalsState {
  topicManager: ModalControl;
  apiSettings: ModalControl;
  dataExportImport: ModalControl;
  storageSettings: ModalControl;
  privacyControls: ModalControl;
  privacyPolicy: ModalControl;
}

interface TailwindModalManagerProps {
  modals: ModalsState;
  socket: Socket | null;
  user: UserData | null;
  currentTopicId?: number;
  isTopicEditing: boolean;
  storageUsage: { usage: number; quota: number; percentage: number } | null;
  messageToDelete: string | null;
  
  // Handlers
  connectSocket: (user: UserData) => void;
  handleSafeTopicSelect: (topicId: number) => void;
  handleTopicEditStart: () => void;
  handleTopicEditEnd: () => void;
  startNewChat: () => void;
  setCurrentTopicId: (topicId?: number) => void;
  confirmDeleteMessage: () => void;
  cancelDeleteMessage: () => void;
  handleDataDeleted: () => void;
}

const TailwindModalManager: React.FC<TailwindModalManagerProps> = ({
  modals,
  socket,
  user,
  currentTopicId,
  isTopicEditing,
  storageUsage,
  messageToDelete,
  connectSocket,
  handleSafeTopicSelect,
  handleTopicEditStart,
  handleTopicEditEnd,
  startNewChat,
  setCurrentTopicId,
  confirmDeleteMessage,
  cancelDeleteMessage,
  handleDataDeleted
}) => {
  return (
    <>
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
    </>
  );
};

export default TailwindModalManager; 