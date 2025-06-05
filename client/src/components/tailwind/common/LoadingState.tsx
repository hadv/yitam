import React from 'react';
import { useLoading } from '../../../contexts/LoadingContext';

interface LoadingStateProps {
  loadingKey: string;
  loadingMessage?: string;
  errorMessage?: string;
  children: React.ReactNode;
}

/**
 * A reusable component that shows loading spinners and error states
 * Uses the LoadingContext to determine if loading or error state should be shown
 */
const LoadingState: React.FC<LoadingStateProps> = ({
  loadingKey,
  loadingMessage = "Đang tải...",
  errorMessage,
  children
}) => {
  const { isLoading, getError } = useLoading();
  
  // Check if this specific operation is loading
  const loading = isLoading(loadingKey);
  
  // Get error for this operation (if any)
  const error = getError(loadingKey) || errorMessage || null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-[#3A2E22]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#5D4A38] mb-4"></div>
        <p>{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium">Đã xảy ra lỗi</h3>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // If not loading and no error, show children
  return <>{children}</>;
};

export default LoadingState; 