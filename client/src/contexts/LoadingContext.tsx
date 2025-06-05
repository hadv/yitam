import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Define types for our loading states
interface LoadingState {
  [key: string]: boolean;
}

// Define types for our error states
interface ErrorState {
  [key: string]: string | null;
}

// Define the shape of our context
interface LoadingContextType {
  isLoading: (key: string) => boolean;
  startLoading: (key: string) => void;
  stopLoading: (key: string) => void;
  getError: (key: string) => string | null;
  setError: (key: string, message: string | null) => void;
  clearError: (key: string) => void;
}

// Create context with default values
const LoadingContext = createContext<LoadingContextType>({
  isLoading: () => false,
  startLoading: () => {},
  stopLoading: () => {},
  getError: () => null,
  setError: () => {},
  clearError: () => {},
});

// Hook for consuming the context
export const useLoading = () => useContext(LoadingContext);

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [loadingState, setLoadingState] = useState<LoadingState>({});
  const [errorState, setErrorState] = useState<ErrorState>({});

  // Check if a specific operation is loading
  const isLoading = useCallback((key: string) => {
    return !!loadingState[key];
  }, [loadingState]);

  // Start loading for a specific operation
  const startLoading = useCallback((key: string) => {
    setLoadingState(prev => ({ ...prev, [key]: true }));
  }, []);

  // Stop loading for a specific operation
  const stopLoading = useCallback((key: string) => {
    setLoadingState(prev => ({ ...prev, [key]: false }));
  }, []);

  // Get error for a specific operation
  const getError = useCallback((key: string) => {
    return errorState[key] || null;
  }, [errorState]);

  // Set error for a specific operation
  const setError = useCallback((key: string, message: string | null) => {
    setErrorState(prev => ({ ...prev, [key]: message }));
  }, []);

  // Clear error for a specific operation
  const clearError = useCallback((key: string) => {
    setErrorState(prev => ({ ...prev, [key]: null }));
  }, []);

  // Provide context value
  const contextValue = {
    isLoading,
    startLoading,
    stopLoading,
    getError,
    setError,
    clearError,
  };

  return (
    <LoadingContext.Provider value={contextValue}>
      {children}
    </LoadingContext.Provider>
  );
};

export default LoadingContext; 