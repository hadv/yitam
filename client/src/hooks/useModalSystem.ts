import { ReactNode } from 'react';
import { useModal, ModalType } from '../contexts/ModalContext';

/**
 * Custom hook for easy modal management in components
 */
export const useModalSystem = () => {
  const { openModal, closeModal, closeAllModals } = useModal();
  
  // Open specific modal types with type safety
  const openApiSettings = () => openModal('apiSettings');
  const openTopicManager = () => openModal('topicManager');
  const openDataExportImport = () => openModal('dataExportImport');
  const openStorageSettings = () => openModal('storageSettings');
  const openPrivacyControls = () => openModal('privacyControls');
  const openPrivacyPolicy = () => openModal('privacyPolicy');
  
  // Open message delete confirmation
  const openMessageDelete = (messageId: string) => {
    openModal('messageDelete', { messageId });
  };

  // Open share conversation modal
  const openShareConversation = (topicId: number) => {
    openModal('shareConversation', { topicId });
  };

  // Open manage shared conversations modal
  const openManageSharedConversations = (ownerId?: string, accessCode?: string) => {
    openModal('manageSharedConversations', { ownerId, accessCode });
  };
  
  // Open a generic confirmation modal
  const openConfirmation = ({
    title,
    message,
    confirmLabel,
    cancelLabel = 'Hủy',
    onConfirm,
    onCancel,
    variant = 'info'
  }: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }) => {
    openModal('confirmation', {
      title,
      message,
      confirmLabel,
      cancelLabel,
      onConfirm,
      onCancel,
      variant
    });
  };
  
  // Open a custom modal with any component
  const openCustomModal = (id: string, component: ReactNode) => {
    openModal('custom', { id, component });
  };
  
  // Common confirmation patterns
  const confirmDeletion = ({
    title = 'Xác nhận xóa',
    message,
    itemName,
    onConfirm
  }: {
    title?: string;
    message?: string;
    itemName: string;
    onConfirm: () => void;
  }) => {
    openConfirmation({
      title,
      message: message || `Bạn có chắc chắn muốn xóa ${itemName}? Hành động này không thể hoàn tác.`,
      confirmLabel: 'Xóa',
      onConfirm,
      variant: 'danger'
    });
  };
  
  const confirmUnsavedChanges = (onConfirm: () => void, onCancel?: () => void) => {
    openConfirmation({
      title: 'Thay đổi chưa lưu',
      message: 'Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn rời đi không?',
      confirmLabel: 'Rời đi',
      onConfirm,
      onCancel,
      variant: 'warning'
    });
  };
  
  return {
    // Simple modal openers
    openApiSettings,
    openTopicManager,
    openDataExportImport,
    openStorageSettings,
    openPrivacyControls,
    openPrivacyPolicy,
    
    // Complex modal openers
    openMessageDelete,
    openShareConversation,
    openManageSharedConversations,
    openConfirmation,
    openCustomModal,
    
    // Common confirmation patterns
    confirmDeletion,
    confirmUnsavedChanges,
    
    // Direct access to core functions
    closeModal,
    closeAllModals
  };
};

export default useModalSystem; 