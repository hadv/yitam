import React from 'react';
import { useModal, ModalType } from '../../../contexts/ModalContext';
import Modal from './Modal';

// Import modal contents
import { TailwindApiKeySettings } from '../TailwindApiKeySettings';
import TailwindTopicManager from '../TailwindTopicManager';
import TailwindDataExportImport from '../TailwindDataExportImport';
import TailwindPrivacyControls from '../TailwindPrivacyControls';
import TailwindPrivacyPolicy from '../TailwindPrivacyPolicy';
import TailwindStorageSettings from '../settings/TailwindStorageSettings';
import TailwindShareConversation from '../TailwindShareConversation';
import TailwindManageSharedConversations from '../TailwindManageSharedConversations';

// Types
import { Socket } from 'socket.io-client';
import { UserData } from '../../../types/chat';

interface ModalManagerProps {
  socket: Socket | null;
  user: UserData | null;
  currentTopicId?: number;
  isTopicEditing: boolean;
  storageUsage: { usage: number; quota: number; percentage: number } | null;
  
  // Handlers
  connectSocket: (user: UserData) => void;
  handleSafeTopicSelect: (topicId: number) => void;
  handleTopicEditStart: () => void;
  handleTopicEditEnd: () => void;
  startNewChat: () => void;
  setCurrentTopicId: (topicId?: number) => void;
  confirmDeleteMessage: () => void;
  handleDataDeleted: () => void;
}

const ModalManager: React.FC<ModalManagerProps> = ({
  socket,
  user,
  currentTopicId,
  isTopicEditing,
  storageUsage,
  connectSocket,
  handleSafeTopicSelect,
  handleTopicEditStart,
  handleTopicEditEnd,
  startNewChat,
  setCurrentTopicId,
  confirmDeleteMessage,
  handleDataDeleted
}) => {
  const { activeModals, modalData, closeModal, openModal } = useModal();

  // Helper function to check if a modal is active
  const isModalActive = (type: ModalType) => activeModals[type] || false;

  return (
    <>
      {/* API Settings Modal */}
      <Modal 
        isOpen={isModalActive('apiSettings')}
        onClose={() => closeModal('apiSettings')}
      >
        <TailwindApiKeySettings 
          onApiKeySet={() => {
            closeModal('apiSettings');
            // Reconnect socket with new API key
            if (user) {
              connectSocket(user);
            }
          }}
          socket={socket || undefined}
        />
      </Modal>
      
      {/* Topic Manager Modal */}
      <Modal
        isOpen={isModalActive('topicManager')}
        onClose={() => closeModal('topicManager')}
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
      </Modal>
      
      {/* Data Export/Import Modal */}
      <Modal
        isOpen={isModalActive('dataExportImport')}
        onClose={() => closeModal('dataExportImport')}
        title="Xuất/Nhập dữ liệu"
        maxWidth="max-w-4xl"
      >
        <TailwindDataExportImport
          userId={user?.email || ''}
          currentTopicId={currentTopicId}
          onClose={() => closeModal('dataExportImport')}
        />
      </Modal>
      
      {/* Storage Settings Modal */}
      <Modal
        isOpen={isModalActive('storageSettings')}
        onClose={() => closeModal('storageSettings')}
        title="Quản lý dung lượng lưu trữ"
        maxWidth="max-w-4xl"
      >
        <TailwindStorageSettings
          userId={user?.email || ''}
          onClose={() => closeModal('storageSettings')}
        />
      </Modal>
      
      {/* Share Conversation Modal */}
      <Modal
        isOpen={isModalActive('shareConversation')}
        onClose={() => closeModal('shareConversation')}
        title="Chia sẻ cuộc trò chuyện"
        maxWidth="max-w-2xl"
      >
        <TailwindShareConversation
          topicId={modalData.shareConversation?.topicId || 0}
          onClose={() => closeModal('shareConversation')}
          onManageShared={() => {
            closeModal('shareConversation');
            openModal('manageSharedConversations', {});
          }}
        />
      </Modal>

      {/* Manage Shared Conversations Modal */}
      <Modal
        isOpen={isModalActive('manageSharedConversations')}
        onClose={() => closeModal('manageSharedConversations')}
        title="Quản lý cuộc trò chuyện đã chia sẻ"
        maxWidth="max-w-4xl"
      >
        <TailwindManageSharedConversations
          onClose={() => closeModal('manageSharedConversations')}
          ownerId={modalData.manageSharedConversations?.ownerId}
          accessCode={modalData.manageSharedConversations?.accessCode}
        />
      </Modal>

      {/* Message Delete Confirmation Modal */}
      <MessageDeleteModal
        isOpen={isModalActive('messageDelete')}
        messageId={(modalData.messageDelete?.messageId as string) || ''}
        onConfirm={() => {
          confirmDeleteMessage();
          closeModal('messageDelete');
        }}
        onCancel={() => closeModal('messageDelete')}
      />
      
      {/* Privacy Controls Modal */}
      <Modal
        isOpen={isModalActive('privacyControls')}
        onClose={() => closeModal('privacyControls')}
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
              closeModal('privacyControls');
              openModal('privacyPolicy');
            }}
            className="px-4 py-2 text-[#78A161] hover:text-[#5D8A46] font-medium"
          >
            Xem Chính sách quyền riêng tư
          </button>
        </div>
      </Modal>
      
      {/* Privacy Policy Modal */}
      <Modal
        isOpen={isModalActive('privacyPolicy')}
        onClose={() => closeModal('privacyPolicy')}
        title="Chính sách quyền riêng tư"
        maxWidth="max-w-4xl"
      >
        <TailwindPrivacyPolicy />
      </Modal>
      
      {/* Generic Confirmation Modal */}
      {modalData.confirmation && (
        <Modal
          isOpen={isModalActive('confirmation')}
          onClose={() => closeModal('confirmation')}
          title={modalData.confirmation.title}
          maxWidth="max-w-md"
        >
          <div className="p-6">
            <p className="text-gray-600 mb-6">{modalData.confirmation.message}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  if (modalData.confirmation?.onCancel) {
                    modalData.confirmation.onCancel();
                  }
                  closeModal('confirmation');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-[#3A2E22] hover:bg-gray-50"
              >
                {modalData.confirmation.cancelLabel || 'Hủy'}
              </button>
              <button
                onClick={() => {
                  modalData.confirmation?.onConfirm();
                  closeModal('confirmation');
                }}
                className={`px-4 py-2 text-white rounded-md ${
                  modalData.confirmation.variant === 'danger' ? 'bg-red-600 hover:bg-red-700' :
                  modalData.confirmation.variant === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
                  'bg-[#78A161] hover:bg-[#5D8A46]'
                }`}
              >
                {modalData.confirmation.confirmLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {/* Custom Modal */}
      {modalData.custom && (
        <Modal
          isOpen={isModalActive('custom')}
          onClose={() => closeModal('custom')}
        >
          {modalData.custom.component}
        </Modal>
      )}
    </>
  );
};

// Create MessageDeleteModal component
interface MessageDeleteModalProps {
  isOpen: boolean;
  messageId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const MessageDeleteModal: React.FC<MessageDeleteModalProps> = ({
  isOpen,
  messageId,
  onConfirm,
  onCancel
}) => {
  if (!messageId) return null;
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Xác nhận xóa"
      maxWidth="max-w-sm"
    >
      <div className="p-6">
        <p className="text-gray-600 mb-6">
          Bạn có chắc chắn muốn xóa tin nhắn này? Hành động này không thể hoàn tác.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-[#3A2E22] hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Xóa
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ModalManager; 