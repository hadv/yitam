import React, { createContext, useContext, useState, useEffect } from 'react';
import { hasStoredApiKey, decryptApiKey } from '../utils/encryption';

interface ApiKeyContextType {
  hasApiKey: boolean;
  getApiKey: () => string | null;
  refreshApiKeyStatus: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const ApiKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasApiKey, setHasApiKey] = useState(false);

  const refreshApiKeyStatus = () => {
    setHasApiKey(hasStoredApiKey());
  };

  useEffect(() => {
    refreshApiKeyStatus();
  }, []);

  const getApiKey = () => {
    return decryptApiKey();
  };

  return (
    <ApiKeyContext.Provider value={{ hasApiKey, getApiKey, refreshApiKeyStatus }}>
      {children}
    </ApiKeyContext.Provider>
  );
};

export const useApiKey = () => {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
}; 