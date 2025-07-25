import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

// Modal types - extend this interface when adding new modal types
export interface ModalData {
  apiSettings: null;
  topicManager: null;
  dataExportImport: null;
  storageSettings: null;
  privacyControls: null;
  privacyPolicy: null;
  messageDelete: {
    messageId: string;
  };
  shareConversation: {
    topicId: number;
  };
  manageSharedConversations: {
    ownerId?: string;
    accessCode?: string;
  };
  // Add more modal types here with their data structures
  confirmation: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel?: () => void;
    variant?: 'danger' | 'warning' | 'info';
  };
  custom: {
    id: string;
    component: ReactNode;
  };
}

export type ModalType = keyof ModalData;

interface ModalContextValue {
  activeModals: Record<ModalType, boolean>;
  modalData: Partial<ModalData>;
  openModal: <T extends ModalType>(type: T, data?: ModalData[T]) => void;
  closeModal: (type: ModalType) => void;
  closeAllModals: () => void;
}

const ModalContext = createContext<ModalContextValue>({
  activeModals: {} as Record<ModalType, boolean>,
  modalData: {},
  openModal: () => {},
  closeModal: () => {},
  closeAllModals: () => {},
});

export const useModal = () => useContext(ModalContext);

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [activeModals, setActiveModals] = useState<Record<ModalType, boolean>>({} as Record<ModalType, boolean>);
  const [modalData, setModalData] = useState<Partial<ModalData>>({});

  const openModal = useCallback(<T extends ModalType>(type: T, data?: ModalData[T]) => {
    setActiveModals(prev => ({ ...prev, [type]: true }));
    if (data) {
      setModalData(prev => ({ ...prev, [type]: data }));
    }
  }, []);

  const closeModal = useCallback((type: ModalType) => {
    setActiveModals(prev => ({ ...prev, [type]: false }));
  }, []);

  const closeAllModals = useCallback(() => {
    const modalTypes = Object.keys(activeModals) as ModalType[];
    const closedModals = modalTypes.reduce((acc, type) => {
      acc[type] = false;
      return acc;
    }, {} as Record<ModalType, boolean>);
    
    setActiveModals(closedModals);
  }, [activeModals]);

  return (
    <ModalContext.Provider
      value={{
        activeModals,
        modalData,
        openModal,
        closeModal,
        closeAllModals,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export default ModalProvider; 