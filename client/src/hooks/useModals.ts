import { useState, useCallback } from 'react';

export const useModals = () => {
  // Modal visibility states
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showDataExportImport, setShowDataExportImport] = useState(false);
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  
  // Notification states
  const [showDataDeletedNotification, setShowDataDeletedNotification] = useState(false);

  // Open modal handlers
  const openTopicManager = useCallback(() => setShowTopicManager(true), []);
  const openApiSettings = useCallback(() => setShowApiSettings(true), []);
  const openDataExportImport = useCallback(() => setShowDataExportImport(true), []);
  const openStorageSettings = useCallback(() => setShowStorageSettings(true), []);
  const openPrivacyControls = useCallback(() => setShowPrivacyControls(true), []);
  const openPrivacyPolicy = useCallback(() => setShowPrivacyPolicy(true), []);

  // Close modal handlers
  const closeTopicManager = useCallback(() => setShowTopicManager(false), []);
  const closeApiSettings = useCallback(() => setShowApiSettings(false), []);
  const closeDataExportImport = useCallback(() => setShowDataExportImport(false), []);
  const closeStorageSettings = useCallback(() => setShowStorageSettings(false), []);
  const closePrivacyControls = useCallback(() => setShowPrivacyControls(false), []);
  const closePrivacyPolicy = useCallback(() => setShowPrivacyPolicy(false), []);

  // Notification handlers
  const showDataDeletedNotice = useCallback(() => {
    setShowDataDeletedNotification(true);
    setTimeout(() => setShowDataDeletedNotification(false), 5000);
  }, []);
  
  const hideDataDeletedNotice = useCallback(() => {
    setShowDataDeletedNotification(false);
  }, []);

  return {
    modals: {
      topicManager: {
        isOpen: showTopicManager,
        open: openTopicManager,
        close: closeTopicManager
      },
      apiSettings: {
        isOpen: showApiSettings,
        open: openApiSettings,
        close: closeApiSettings
      },
      dataExportImport: {
        isOpen: showDataExportImport,
        open: openDataExportImport,
        close: closeDataExportImport
      },
      storageSettings: {
        isOpen: showStorageSettings,
        open: openStorageSettings,
        close: closeStorageSettings
      },
      privacyControls: {
        isOpen: showPrivacyControls,
        open: openPrivacyControls,
        close: closePrivacyControls
      },
      privacyPolicy: {
        isOpen: showPrivacyPolicy,
        open: openPrivacyPolicy,
        close: closePrivacyPolicy
      }
    },
    notifications: {
      dataDeleted: {
        isVisible: showDataDeletedNotification,
        show: showDataDeletedNotice,
        hide: hideDataDeletedNotice
      }
    }
  };
};

export default useModals; 