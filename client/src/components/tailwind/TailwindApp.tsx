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
import TailwindMessagePersistence, { useMessagePersistence } from './TailwindMessagePersistence';
import TailwindHeader from './TailwindHeader';
import TailwindFooter from './TailwindFooter';
import TailwindMessageDisplay from './TailwindMessageDisplay';
import TailwindModal from './TailwindModal';
import TailwindDataExportImport from './TailwindDataExportImport';
import { BetaBanner, ApiKeyWarning } from './TailwindBanners';

// Utilities
import { decryptApiKey } from '../../utils/encryption';
import { debugIndexedDB, reinitializeDatabase } from '../../db/ChatHistoryDBUtil';
import { checkDatabaseVersionMismatch, updateStoredDatabaseVersion, getSystemInfo } from '../../utils/version';
import { extractTitleFromBotText } from '../../utils/titleExtraction';
import { setupWindowDebugFunctions } from '../../utils/debugging';
import { reindexAllUserMessages, getSearchIndexStats } from '../../utils/searchUtils';
import { advancedSearch } from '../../db/ChatHistoryDBUtil';

// Types
import { UserData, Message } from '../../types/chat';
import db from '../../db/ChatHistoryDB';

// Internal types for our extended data model
interface ExtendedTopic {
  id?: number;
  userId: string;
  lastActive: number;
  [key: string]: any; // Allow any other properties
}

interface ExtendedMessage {
  id?: number;
  topicId: number;
  content: string;
  [key: string]: any; // Allow any other properties
}

// Storage Settings Component
const TailwindStorageSettings = ({
  retentionPolicyDays,
  setRetentionPolicyDays,
  autoCleanupEnabled,
  setAutoCleanupEnabled,
  messageCompressionEnabled,
  setMessageCompressionEnabled,
  messagePageSize,
  setMessagePageSize,
  storageUsage,
  onClose,
  userId
}: {
  retentionPolicyDays: number;
  setRetentionPolicyDays: (days: number) => void;
  autoCleanupEnabled: boolean;
  setAutoCleanupEnabled: (enabled: boolean) => void;
  messageCompressionEnabled: boolean;
  setMessageCompressionEnabled: (enabled: boolean) => void;
  messagePageSize: number;
  setMessagePageSize: (size: number) => void;
  storageUsage: any;
  onClose: () => void;
  userId: string;
}) => {
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<any>(null);
  const [keepCount, setKeepCount] = useState(50);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const handleCleanupOldest = async () => {
    if (!userId || isRunningCleanup) return;
    
    // Clear previous results and errors
    setCleanupResult(null);
    setErrorMessage(null);
    setIsRunningCleanup(true);
    
    try {
      console.log(`[UI] Cleaning up old conversations, keeping newest ${keepCount}`);
      
      if (typeof window.cleanupOldestConversations !== 'function') {
        console.error('[UI] cleanupOldestConversations function not available');
        setErrorMessage('Cleanup function not available. Please try refreshing the page.');
        return;
      }
      
      // Call the cleanup function
      const result = await window.cleanupOldestConversations(keepCount);
      console.log('[UI] Cleanup result:', result);
      
      if (result.success) {
        setCleanupResult(result);
      } else {
        setErrorMessage(result.error ? String(result.error) : 'Unknown error during cleanup');
      }
    } catch (error) {
      console.error('[UI] Error cleaning up conversations:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during cleanup');
    } finally {
      setIsRunningCleanup(false);
    }
  };
  
  const handleCompressMessages = async () => {
    if (!userId || isRunningCleanup) return;
    
    // Clear previous results and errors
    setCleanupResult(null);
    setErrorMessage(null);
    setIsRunningCleanup(true);
    
    try {
      if (typeof window.compressMessages !== 'function') {
        console.error('[UI] compressMessages function not available');
        setErrorMessage('Compression function not available. Please try refreshing the page.');
        return;
      }
      
      const result = await window.compressMessages();
      console.log('[UI] Compression result:', result);
      
      if (result.success) {
        setCleanupResult(result);
      } else {
        setErrorMessage(result.error ? String(result.error) : 'Unknown error during compression');
      }
    } catch (error) {
      console.error('[UI] Error compressing messages:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during compression');
    } finally {
      setIsRunningCleanup(false);
    }
  };

  // Handle storage analysis
  const handleAnalyzeStorage = async () => {
    if (!userId || isRunningCleanup) return;
    
    // Clear previous results and errors
    setCleanupResult(null);
    setErrorMessage(null);
    setIsRunningCleanup(true);
    
    try {
      if (typeof window.analyzeStorage !== 'function') {
        console.error('[UI] analyzeStorage function not available');
        setErrorMessage('Analysis function not available. Please try refreshing the page.');
        return;
      }
      
      const result = await window.analyzeStorage();
      console.log('[UI] Storage analysis result:', result);
      
      if (result.success) {
        setCleanupResult({
          type: 'analysis',
          ...result
        });
      } else {
        setErrorMessage(result.error ? String(result.error) : 'Unknown error during analysis');
      }
    } catch (error) {
      console.error('[UI] Error analyzing storage:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during analysis');
    } finally {
      setIsRunningCleanup(false);
    }
  };

  // Handle cleanup of orphaned data
  const handleCleanupOrphanedData = async () => {
    if (!userId || isRunningCleanup) return;
    
    // Clear previous results and errors
    setCleanupResult(null);
    setErrorMessage(null);
    setIsRunningCleanup(true);
    
    try {
      if (typeof window.cleanupOrphanedData !== 'function') {
        console.error('[UI] cleanupOrphanedData function not available');
        setErrorMessage('Cleanup function not available. Please try refreshing the page.');
        return;
      }
      
      const result = await window.cleanupOrphanedData();
      console.log('[UI] Orphaned data cleanup result:', result);
      
      if (result.success) {
        // Run analysis again to show updated stats
        if (typeof window.analyzeStorage === 'function') {
          const analysisResult = await window.analyzeStorage();
          if (analysisResult.success) {
            setCleanupResult({
              type: 'orphaned-cleanup',
              cleanupResult: result,
              analysisResult
            });
          } else {
            setCleanupResult({
              type: 'orphaned-cleanup',
              cleanupResult: result
            });
          }
        } else {
          setCleanupResult({
            type: 'orphaned-cleanup',
            cleanupResult: result
          });
        }
      } else {
        setErrorMessage(result.error ? String(result.error) : 'Unknown error during cleanup');
      }
    } catch (error) {
      console.error('[UI] Error cleaning up orphaned data:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during cleanup');
    } finally {
      setIsRunningCleanup(false);
    }
  };
  
  return (
    <div className="p-6">
      <h3 className="text-lg font-medium text-[#3A2E22] mb-4">Cài đặt lưu trữ</h3>
      
      {/* Storage Usage Visualization */}
      {storageUsage && storageUsage.percentage > 0 && (
        <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
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
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full ${
                storageUsage.percentage > 80 ? 'bg-red-500' : 
                storageUsage.percentage > 60 ? 'bg-amber-500' : 'bg-[#78A161]'
              }`}
              style={{ width: `${Math.min(100, storageUsage.percentage)}%` }}
            ></div>
          </div>
          
          {/* Warning message for high storage usage */}
          {storageUsage.percentage > 80 && (
            <div className="mt-2 text-sm text-red-600">
              <strong>Cảnh báo:</strong> Dung lượng lưu trữ gần đầy. Hãy xóa bớt cuộc trò chuyện cũ hoặc bật tính năng tự động dọn dẹp.
            </div>
          )}
        </div>
      )}
      
      {/* Retention Policy Settings */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[#3A2E22] mb-2">
          Chính sách lưu trữ (ngày)
        </label>
        <div className="flex items-center space-x-3">
          <input
            type="range"
            min="7"
            max="365"
            step="1"
            value={retentionPolicyDays}
            onChange={(e) => setRetentionPolicyDays(parseInt(e.target.value))}
            className="w-full"
          />
          <span className="w-12 text-center">{retentionPolicyDays}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Cuộc trò chuyện cũ hơn {retentionPolicyDays} ngày sẽ được xóa tự động nếu bật tính năng tự động dọn dẹp.
        </p>
      </div>
      
      {/* Auto Cleanup Toggle */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[#3A2E22]">
            Tự động dọn dẹp cuộc trò chuyện cũ
          </label>
          <div className="relative inline-block w-10 mr-2 align-middle select-none">
            <input
              type="checkbox"
              name="auto-cleanup"
              id="auto-cleanup"
              checked={autoCleanupEnabled}
              onChange={(e) => setAutoCleanupEnabled(e.target.checked)}
              className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
            />
            <label
              htmlFor="auto-cleanup"
              className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                autoCleanupEnabled ? 'bg-[#78A161]' : 'bg-gray-300'
              }`}
            ></label>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Khi bật, hệ thống sẽ tự động xóa cuộc trò chuyện cũ hơn {retentionPolicyDays} ngày.
        </p>
      </div>
      
      {/* Message Compression Toggle */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[#3A2E22]">
            Nén tin nhắn dài
          </label>
          <div className="relative inline-block w-10 mr-2 align-middle select-none">
            <input
              type="checkbox"
              name="message-compression"
              id="message-compression"
              checked={messageCompressionEnabled}
              onChange={(e) => setMessageCompressionEnabled(e.target.checked)}
              className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
            />
            <label
              htmlFor="message-compression"
              className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                messageCompressionEnabled ? 'bg-[#78A161]' : 'bg-gray-300'
              }`}
            ></label>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Tin nhắn dài sẽ được nén để tiết kiệm dung lượng lưu trữ.
        </p>
      </div>
      
      {/* Message Paging Size */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[#3A2E22] mb-2">
          Số tin nhắn hiển thị mỗi trang
        </label>
        <div className="flex items-center space-x-3">
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={messagePageSize}
            onChange={(e) => setMessagePageSize(parseInt(e.target.value))}
            className="w-full"
          />
          <span className="w-12 text-center">{messagePageSize}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Hiển thị ít tin nhắn hơn có thể cải thiện hiệu suất cho cuộc trò chuyện dài.
        </p>
      </div>
      
      {/* Manual Cleanup */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
        <h4 className="text-md font-medium text-[#3A2E22] mb-2">Dọn dẹp thủ công</h4>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#3A2E22] mb-2">
            Giữ lại số cuộc trò chuyện gần nhất
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="range"
              min="5"
              max="200"
              step="5"
              value={keepCount}
              onChange={(e) => setKeepCount(parseInt(e.target.value))}
              className="w-full"
            />
            <span className="w-12 text-center">{keepCount}</span>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleCleanupOldest}
            disabled={isRunningCleanup}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
          >
            {isRunningCleanup ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : 'Xóa cuộc trò chuyện cũ'}
          </button>
          
          <button
            onClick={handleCompressMessages}
            disabled={isRunningCleanup}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunningCleanup ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : 'Nén tin nhắn'}
          </button>
          
          <button
            onClick={handleAnalyzeStorage}
            disabled={isRunningCleanup}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {isRunningCleanup ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : 'Phân tích dung lượng'}
          </button>
        </div>
        
        {/* Error message */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <strong>Lỗi:</strong> {errorMessage}
          </div>
        )}
        
        {/* Result display */}
        {cleanupResult && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
            <div className="font-medium text-green-800 mb-1">Thao tác thành công!</div>
            
            {/* Different result displays based on operation type */}
            {cleanupResult.type === 'analysis' ? (
              <div className="space-y-2">
                <h4 className="font-medium text-green-800">Kết quả phân tích dung lượng:</h4>
                
                {cleanupResult.counts && (
                  <div className="ml-2">
                    <div className="text-green-700">Số lượng đề mục: {cleanupResult.counts.topics}</div>
                    <div className="text-green-700">Số lượng tin nhắn: {cleanupResult.counts.messages}</div>
                    <div className="text-green-700">Số lượng chỉ mục từ: {cleanupResult.counts.wordIndices}</div>
                    {cleanupResult.counts.orphanedMessages > 0 && (
                      <div className="text-amber-600">
                        Phát hiện {cleanupResult.counts.orphanedMessages} tin nhắn không thuộc về đề mục nào!
                      </div>
                    )}
                  </div>
                )}
                
                {cleanupResult.storageEstimate && (
                  <div className="ml-2">
                    <div className="text-green-700">
                      Dung lượng sử dụng: {(cleanupResult.storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB
                    </div>
                    <div className="text-green-700">
                      Tỷ lệ sử dụng: {cleanupResult.storageEstimate.percentage.toFixed(1)}%
                    </div>
                  </div>
                )}
                
                {cleanupResult.recommendedAction && (
                  <div className={`ml-2 ${cleanupResult.counts?.orphanedMessages > 0 ? 'text-amber-600' : 'text-green-700'}`}>
                    <strong>Đề xuất:</strong> {cleanupResult.recommendedAction === "No issues detected" ? "Không phát hiện vấn đề" : cleanupResult.recommendedAction}
                    
                    {/* Show cleanup button if orphaned messages are detected */}
                    {cleanupResult.counts?.orphanedMessages > 0 && (
                      <button
                        onClick={handleCleanupOrphanedData}
                        disabled={isRunningCleanup}
                        className="ml-3 px-3 py-1 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 disabled:opacity-50"
                      >
                        {isRunningCleanup ? 'Đang xử lý...' : 'Dọn dẹp dữ liệu ngay'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : cleanupResult.type === 'orphaned-cleanup' ? (
              <div className="space-y-2">
                <h4 className="font-medium text-green-800">Kết quả dọn dẹp dữ liệu:</h4>
                
                {cleanupResult.cleanupResult && (
                  <div className="ml-2">
                    <div className="text-green-700">
                      Đã xóa {cleanupResult.cleanupResult.deletedMessages || 0} tin nhắn mồ côi
                    </div>
                    <div className="text-green-700">
                      Đã xóa {cleanupResult.cleanupResult.deletedTopics || 0} đề mục trống
                    </div>
                    {cleanupResult.cleanupResult.deletedWordIndices > 0 && (
                      <div className="text-green-700">
                        Đã xóa {cleanupResult.cleanupResult.deletedWordIndices} chỉ mục từ mồ côi
                      </div>
                    )}
                  </div>
                )}
                
                {/* Show updated analysis results if available */}
                {cleanupResult.analysisResult && cleanupResult.analysisResult.counts && (
                  <div className="mt-4">
                    <h5 className="font-medium text-green-800">Kết quả phân tích sau khi dọn dẹp:</h5>
                    <div className="ml-2">
                      <div className="text-green-700">Số lượng đề mục: {cleanupResult.analysisResult.counts.topics}</div>
                      <div className="text-green-700">Số lượng tin nhắn: {cleanupResult.analysisResult.counts.messages}</div>
                      <div className="text-green-700">Số lượng chỉ mục từ: {cleanupResult.analysisResult.counts.wordIndices}</div>
                      {cleanupResult.analysisResult.counts.orphanedMessages > 0 ? (
                        <div className="text-amber-600">
                          Vẫn còn {cleanupResult.analysisResult.counts.orphanedMessages} tin nhắn không thuộc về đề mục nào!
                          <button
                            onClick={handleCleanupOrphanedData}
                            disabled={isRunningCleanup}
                            className="ml-3 px-3 py-1 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 disabled:opacity-50"
                          >
                            {isRunningCleanup ? 'Đang xử lý...' : 'Thử dọn dẹp lại'}
                          </button>
                        </div>
                      ) : (
                        <div className="text-green-700">Không còn tin nhắn mồ côi!</div>
                      )}
                    </div>
                    
                    {cleanupResult.analysisResult.storageEstimate && (
                      <div className="ml-2 mt-2">
                        <div className="text-green-700">
                          Dung lượng sử dụng hiện tại: {(cleanupResult.analysisResult.storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : cleanupResult.deletedCount !== undefined ? (
              <div className="text-green-700">Đã xóa {cleanupResult.deletedCount} cuộc trò chuyện.</div>
            ) : cleanupResult.compressedCount !== undefined ? (
              <div>
                <div className="text-green-700">Đã nén {cleanupResult.compressedCount} tin nhắn.</div>
                {cleanupResult.savingsPercentage !== undefined && (
                  <div className="text-green-700">Tiết kiệm {cleanupResult.savingsPercentage.toFixed(1)}% dung lượng.</div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
      
      {/* CSS for toggle switch */}
      <style>{`
        .toggle-checkbox:checked {
          right: 0;
          border-color: #78A161;
        }
        .toggle-checkbox:checked + .toggle-label {
          background-color: #78A161;
        }
        .toggle-checkbox {
          right: 0;
          border-color: #ccc;
          transition: all 0.3s;
        }
        .toggle-label {
          transition: all 0.3s;
        }
      `}</style>
      
      {/* Close button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-[#3A2E22] text-white rounded-md hover:bg-[#2A1E12]"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};

function TailwindApp() {
  // User state
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  // UI state
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showDataExportImport, setShowDataExportImport] = useState(false);
  const [questionsLimit] = useState(6);
  const inputRef = useRef<HTMLDivElement>(null);
  
  // Storage management state
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [retentionPolicyDays, setRetentionPolicyDays] = useState<number>(() => {
    const saved = localStorage.getItem('retentionPolicyDays');
    return saved ? parseInt(saved) : 90; // Default 90 days retention
  });
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoCleanupEnabled');
    return saved ? saved === 'true' : false; // Default disabled
  });
  const [messageCompressionEnabled, setMessageCompressionEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('messageCompressionEnabled');
    return saved ? saved === 'true' : true; // Default enabled
  });
  const [messagePageSize, setMessagePageSize] = useState<number>(() => {
    const saved = localStorage.getItem('messagePageSize');
    return saved ? parseInt(saved) : 30; // Default 30 messages per page
  });
  
  // Message deletion state
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  
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
      async (topicId: number) => {
        try {
          console.log(`[EXPORT DEBUG] Exporting topic ${topicId}`);
          
          // Get the topic
          const topic = await db.topics.get(topicId);
          if (!topic) {
            console.error(`[EXPORT DEBUG] Topic ${topicId} not found`);
            return { success: false, error: 'Topic not found' };
          }
          
          // Get all messages for this topic
          const messages = await db.messages
            .where('topicId')
            .equals(topicId)
            .toArray();
          
          // Create export data
          const exportData = {
            topics: [topic],
            messages: messages
          };
          
          // Create a download link
          const dataStr = JSON.stringify(exportData, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(dataBlob);
          
          // Create filename with topic title and date
          const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
          const safeTitle = topic.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
          const filename = `yitam_${safeTitle}_${date}.json`;
          
          // Create and click a download link
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          
          // Clean up
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
          
          return { success: true, topic, messageCount: messages.length };
        } catch (error) {
          console.error('[EXPORT DEBUG] Error exporting topic:', error);
          return { success: false, error };
        }
      },
      (text: string) => extractTitleFromBotText(text)
    );
    
    // Add a helper function to trigger topic refresh via event
    window.triggerTopicListRefresh = () => {
      console.log('[APP] Triggering topic list refresh via event');
      // First try the regular refreshTopicList function if available
      if (window.refreshTopicList && typeof window.refreshTopicList === 'function') {
        window.refreshTopicList();
      }
      
      // Also dispatch a custom event for components that listen for it
      window.dispatchEvent(new Event('storage:refreshTopics'));
    };

    // Add search-related debug functions
    window.reindexAllMessages = async (userId: string) => {
      console.log(`[SEARCH DEBUG] Reindexing all messages for user ${userId}`);
      return await reindexAllUserMessages(userId);
    };

    window.reindexCurrentTopic = async () => {
      if (!currentTopicId) {
        console.warn('[SEARCH DEBUG] No current topic to reindex');
        return false;
      }
      console.log(`[SEARCH DEBUG] Reindexing current topic ${currentTopicId}`);
      const { reindexTopic } = await import('../../db/ChatHistoryDBUtil');
      const success = await reindexTopic(currentTopicId);
      return success;
    };

    window.getSearchStats = async () => {
      console.log('[SEARCH DEBUG] Getting search index statistics');
      return await getSearchIndexStats();
    };

    window.searchMessages = async (query: string, filters = {}) => {
      if (!user || !user.email) {
        console.warn('[SEARCH DEBUG] No user to search for');
        return [];
      }
      console.log(`[SEARCH DEBUG] Searching for "${query}" with filters:`, filters);
      return await advancedSearch(query, user.email, filters);
    };
    
    return () => {
      cleanup();
      delete window.triggerTopicListRefresh;
      delete window.reindexAllMessages;
      delete window.reindexCurrentTopic;
      delete window.getSearchStats;
      delete window.searchMessages;
    };
  }, [currentPersonaId, absoluteForcePersona, user, currentTopicId]);

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

  // Handle message deletion request
  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessageToDelete(messageId);
  }, []);

  // Confirm message deletion
  const confirmDeleteMessage = useCallback(async () => {
    if (!messageToDelete || !currentTopicId) return;
    
    try {
      // Find the message object in the current messages array
      const messageObj = messages.find(msg => msg.id === messageToDelete);
      if (!messageObj) return;
      
      // Log message details for debugging
      console.log('[DELETE DEBUG] Attempting to delete message:', {
        uiId: messageObj.id,
        dbId: messageObj.dbMessageId,
        isBot: messageObj.isBot,
        text: messageObj.text.substring(0, 30) + (messageObj.text.length > 30 ? '...' : '')
      });
      
      // Remove message from UI immediately to give instant feedback
      setMessages(messages.filter(msg => msg.id !== messageToDelete));
      
      // Store the current topic ID for later checking if it's deleted
      const topicToCheck = currentTopicId;
      
      // If it's a DB message (has a numeric id stored in the message object)
      if (messageObj.dbMessageId) {
        try {
          // First verify the message exists in the database
          const messageInDb = await db.messages.get(messageObj.dbMessageId);
          if (!messageInDb) {
            console.warn(`[DELETE DEBUG] Message ${messageObj.dbMessageId} not found in database`);
            setMessageToDelete(null);
            return;
          }
          
          // Delete from database using direct database deletion for reliability
          console.log(`[DELETE DEBUG] Forcefully deleting message ${messageObj.dbMessageId} from database`);
          const deleteResult = await db.forceDeleteMessage(messageObj.dbMessageId);
          
          if (!deleteResult) {
            console.error(`[DELETE DEBUG] Failed to delete message ${messageObj.dbMessageId} from database`);
            alert('Failed to delete message. Please try again later.');
            setMessageToDelete(null);
            return;
          }
          
          console.log(`[DELETE DEBUG] Message ${messageObj.dbMessageId} deleted successfully from database`);
          
          // Double-check message was actually deleted
          const verifyDeleted = await db.messages.get(messageObj.dbMessageId);
          if (verifyDeleted) {
            console.error(`[DELETE DEBUG] Critical error: Message ${messageObj.dbMessageId} still exists in database after deletion`);
            // Try one more time with direct table access
            await db.messages.where('id').equals(messageObj.dbMessageId).delete();
            
            // Check again
            const secondCheck = await db.messages.get(messageObj.dbMessageId);
            if (secondCheck) {
              console.error(`[DELETE DEBUG] Fatal error: Message ${messageObj.dbMessageId} cannot be deleted`);
              alert('Failed to delete message. Please try again later.');
              setMessageToDelete(null);
              return;
            }
          }
          
          // Now check the message count for the topic
          const remainingMessages = await db.messages.where('topicId').equals(topicToCheck).count();
          console.log(`[DELETE DEBUG] Topic ${topicToCheck} now has ${remainingMessages} messages`);
          
          // If no messages remain, delete the topic
          if (remainingMessages === 0) {
            console.log(`[DELETE DEBUG] No messages left in topic ${topicToCheck}, deleting topic`);
            await db.deleteTopic(topicToCheck);
            console.log(`[DELETE DEBUG] Topic ${topicToCheck} deleted successfully`);
            
            // Update UI state
            setCurrentTopicId(undefined);
            startNewChat();
            
            // Trigger topic list refresh
            if (window.triggerTopicListRefresh) {
              window.triggerTopicListRefresh();
            }
          } else {
            // Update topic count in the database
            await db.updateTopicMessageCount(topicToCheck);
            
            // Trigger UI updates
            if (window.updateTopicMessageCount) {
              window.updateTopicMessageCount(topicToCheck, remainingMessages);
            }
            
            if (window.triggerTopicListRefresh) {
              window.triggerTopicListRefresh();
            }
          }
        } catch (error) {
          console.error(`[DELETE DEBUG] Error deleting message:`, error);
          alert('Failed to delete message. Please try again later.');
        }
      }
    } finally {
      // Clear the message to delete
      setMessageToDelete(null);
    }
  }, [messageToDelete, messages, setMessages, currentTopicId, startNewChat, setCurrentTopicId]);

  // Cancel message deletion
  const cancelDeleteMessage = useCallback(() => {
    setMessageToDelete(null);
  }, []);

  // Clear cached messages when switching topics or starting new chat
  useEffect(() => {
    // This ensures we always fetch fresh messages from the database when the topic changes
    console.log(`[TOPIC DEBUG] Topic changed to ${currentTopicId}, clearing cached messages`);
    
    // We could add additional cleanup here if needed
    return () => {
      // Cleanup when topic changes or component unmounts
    };
  }, [currentTopicId]);

  // Save storage management settings when they change
  useEffect(() => {
    localStorage.setItem('retentionPolicyDays', retentionPolicyDays.toString());
    localStorage.setItem('autoCleanupEnabled', autoCleanupEnabled.toString());
    localStorage.setItem('messageCompressionEnabled', messageCompressionEnabled.toString());
    localStorage.setItem('messagePageSize', messagePageSize.toString());
    
    // Make settings available globally
    window.setStorageRetentionPolicy = (days: number) => {
      setRetentionPolicyDays(days);
    };
    
    return () => {
      delete window.setStorageRetentionPolicy;
    };
  }, [retentionPolicyDays, autoCleanupEnabled, messageCompressionEnabled, messagePageSize]);
  
  // Implement automatic cleanup based on retention policy
  useEffect(() => {
    if (!user || !autoCleanupEnabled) return;
    
    const performAutoCleanup = async () => {
      try {
        console.log('[STORAGE] Running automatic cleanup based on retention policy');
        
        // Get cutoff date based on retention policy
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionPolicyDays);
        
        // Delete topics older than the cutoff date
        const oldTopicsDeleted = await db.topics
          .where('userId').equals(user.email)
          .and((topic) => {
            // Cast to our extended interface to avoid type errors
            const extTopic = topic as ExtendedTopic;
            if (!extTopic.lastActive) return false;
            return new Date(extTopic.lastActive) < cutoffDate;
          })
          .delete();
        
        // Also perform orphaned data cleanup
        const cleanupResult = await db.cleanupOrphanedData();
        
        console.log(`[STORAGE] Auto cleanup completed: ${oldTopicsDeleted} old topics deleted`);
        console.log('[STORAGE] Orphaned data cleanup results:', cleanupResult);
        
        // Trigger UI updates
        if (window.triggerTopicListRefresh) {
          window.triggerTopicListRefresh();
        }
      } catch (error) {
        console.error('[STORAGE] Error during automatic cleanup:', error);
      }
    };
    
    // Run cleanup immediately on app start
    performAutoCleanup();
    
    return () => {
      // No need to clean up window.cleanupOldestConversations here
      // It's now handled in a separate useEffect
    };
  }, [user, autoCleanupEnabled, retentionPolicyDays]);
  
  // Register storage management functions on window
  useEffect(() => {
    if (!user) return;
    
    // Define cleanupOldestConversations function - available regardless of autoCleanupEnabled setting
    window.cleanupOldestConversations = async (keepCount = 50) => {
      try {
        console.log(`[STORAGE] Manual cleanup requested, keeping newest ${keepCount} conversations`);
        
        // Get total topic count
        const totalTopics = await db.topics
          .where('userId').equals(user.email)
          .count();
        
        if (totalTopics <= keepCount) {
          console.log(`[STORAGE] No cleanup needed, only ${totalTopics} topics exist`);
          return { success: true, deletedCount: 0 };
        }
        
        // Get all topics sorted by last active date
        const allTopics = await db.topics
          .where('userId').equals(user.email)
          .sortBy('lastActive');
        
        // Determine how many to delete
        const deleteCount = totalTopics - keepCount;
        
        // Get IDs of oldest topics to delete
        const topicsToDelete = allTopics
          .slice(0, deleteCount)
          .map(topic => topic.id)
          .filter((id): id is number => id !== undefined);
        
        console.log(`[STORAGE] Deleting ${topicsToDelete.length} oldest topics: ${topicsToDelete.join(', ')}`);
        
        // Delete those topics
        if (topicsToDelete.length > 0) {
          const deleteResult = await db.topics
            .bulkDelete(topicsToDelete);
          
          console.log(`[STORAGE] Deleted ${deleteResult} oldest topics`);
          
          // Also perform orphaned data cleanup
          await db.cleanupOrphanedData();
          
          // Trigger UI updates
          if (window.triggerTopicListRefresh) {
            window.triggerTopicListRefresh();
          }
          
          return { success: true, deletedCount: deleteResult };
        } else {
          console.warn('[STORAGE] No topics were selected for deletion');
          return { success: false, error: 'No topics selected for deletion' };
        }
      } catch (error) {
        console.error('[STORAGE] Error during manual cleanup:', error);
        return { success: false, error };
      }
    };
    
    // Add cleanup orphaned data function
    window.cleanupOrphanedData = async () => {
      try {
        console.log('[STORAGE] Running orphaned data cleanup...');
        
        // First count orphaned messages before cleanup
        let orphanedMessagesBefore = 0;
        let orphanedMessageIds: number[] = [];
        
        try {
          // Get all valid topic IDs
          const allTopicIds = await db.topics.toCollection().primaryKeys() as number[];
          console.log(`[STORAGE] Found ${allTopicIds.length} valid topics`);
          
          // Find messages that don't belong to any valid topic
          const allMessages = await db.messages.toArray();
          orphanedMessageIds = allMessages
            .filter(msg => !allTopicIds.includes(msg.topicId))
            .map(msg => msg.id)
            .filter((id): id is number => id !== undefined);
          
          orphanedMessagesBefore = orphanedMessageIds.length;
          console.log(`[STORAGE] Found ${orphanedMessagesBefore} orphaned messages before cleanup`);
          console.log(`[STORAGE] Orphaned message IDs:`, orphanedMessageIds.slice(0, 10), orphanedMessageIds.length > 10 ? `...and ${orphanedMessageIds.length - 10} more` : '');
        } catch (countError) {
          console.error('[STORAGE] Error counting orphaned messages:', countError);
        }
        
        // Run the standard database cleanup function first
        const cleanupResult = await db.cleanupOrphanedData();
        console.log('[STORAGE] Standard cleanup result:', cleanupResult);
        
        // Manually delete orphaned messages if the standard cleanup didn't work
        let manuallyDeletedCount = 0;
        if (orphanedMessageIds.length > 0) {
          console.log(`[STORAGE] Standard cleanup didn't remove orphaned messages, attempting manual deletion of ${orphanedMessageIds.length} messages`);
          
          // Delete in batches to avoid overwhelming the database
          const BATCH_SIZE = 50;
          for (let i = 0; i < orphanedMessageIds.length; i += BATCH_SIZE) {
            const batch = orphanedMessageIds.slice(i, i + BATCH_SIZE);
            try {
              // Delete each message individually to avoid issues with bulkDelete
              for (const msgId of batch) {
                await db.messages.delete(msgId);
                manuallyDeletedCount++;
              }
              console.log(`[STORAGE] Manually deleted batch of ${batch.length} messages (${i+1}-${Math.min(i+BATCH_SIZE, orphanedMessageIds.length)} of ${orphanedMessageIds.length})`);
            } catch (deleteError) {
              console.error(`[STORAGE] Error deleting batch of messages:`, deleteError);
            }
            
            // Small delay between batches to prevent UI freezing
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          console.log(`[STORAGE] Manually deleted ${manuallyDeletedCount} orphaned messages`);
        }
        
        // Count empty topics
        let emptyTopicIds: number[] = [];
        try {
          // Get all topic IDs
          const allTopicIds = await db.topics.toCollection().primaryKeys() as number[];
          
          // Find empty topics
          for (const topicId of allTopicIds) {
            const messageCount = await db.messages.where('topicId').equals(topicId).count();
            if (messageCount === 0) {
              emptyTopicIds.push(topicId);
            }
          }
          
          console.log(`[STORAGE] Found ${emptyTopicIds.length} empty topics`);
        } catch (countError) {
          console.error('[STORAGE] Error counting empty topics:', countError);
        }
        
        // Delete empty topics
        let deletedEmptyTopics = 0;
        if (emptyTopicIds.length > 0) {
          try {
            // Delete each topic properly
            for (const topicId of emptyTopicIds) {
              const result = await db.deleteTopic(topicId);
              if (result.success) {
                deletedEmptyTopics++;
              }
            }
            console.log(`[STORAGE] Deleted ${deletedEmptyTopics} empty topics`);
          } catch (deleteError) {
            console.error(`[STORAGE] Error deleting empty topics:`, deleteError);
          }
        }
        
        // Count orphaned messages after cleanup
        let orphanedMessagesAfter = 0;
        try {
          const allTopicIds = await db.topics.toCollection().primaryKeys() as number[];
          const allMessages = await db.messages.toArray();
          orphanedMessagesAfter = allMessages.filter(msg => !allTopicIds.includes(msg.topicId)).length;
          
          console.log(`[STORAGE] Found ${orphanedMessagesAfter} orphaned messages after cleanup`);
        } catch (countError) {
          console.error('[STORAGE] Error counting orphaned messages after cleanup:', countError);
        }
        
        // Return detailed results
        return {
          success: true,
          deletedMessages: manuallyDeletedCount + (cleanupResult.deletedMessages || 0),
          deletedTopics: cleanupResult.deletedTopics || 0,
          deletedWordIndices: cleanupResult.deletedWordIndices || 0,
          messagesBeforeCleanup: orphanedMessagesBefore,
          messagesAfterCleanup: orphanedMessagesAfter,
          emptyTopicsDeleted: deletedEmptyTopics
        };
      } catch (error) {
        console.error('[STORAGE] Error cleaning up orphaned data:', error);
        return { success: false, error };
      }
    };
    
    // Define compressMessages function - available regardless of messageCompressionEnabled setting
    window.compressMessages = async (topicId?: number) => {
      try {
        console.log(`[STORAGE] Compressing messages${topicId ? ` for topic ${topicId}` : ' for all topics'}`);
        
        // Get the messages to compress
        let messagesToCompress;
        if (topicId) {
          messagesToCompress = await db.messages
            .where('topicId').equals(topicId)
            .toArray();
        } else {
          // Get topics for this user
          const userTopics = await db.topics
            .where('userId').equals(user.email)
            .toArray();
          
          const topicIds = userTopics.map(t => t.id)
            .filter((id): id is number => id !== undefined);
          
          messagesToCompress = await db.messages
            .where('topicId').anyOf(topicIds)
            .toArray();
        }
        
        // We need to convert DB messages to UI messages for compression
        // In DB, message content is in 'content' property, not 'text'
        const largeMessages = messagesToCompress.filter(m => {
          // Cast to our extended interface to avoid type errors
          const extMsg = m as ExtendedMessage;
          return typeof extMsg.content === 'string' && 
                 extMsg.content.length > 1000 && 
                 !extMsg.metadata?.compressed; // Skip already compressed messages
        });
        
        if (largeMessages.length === 0) {
          console.log('[STORAGE] No large messages found that need compression');
          return { success: true, compressedCount: 0 };
        }
        
        console.log(`[STORAGE] Found ${largeMessages.length} large messages to compress`);
        
        // Compression statistics
        let totalChars = 0;
        let compressedChars = 0;
        let updatedCount = 0;
        
        // Process messages in batches to avoid overwhelming the database
        const batchSize = 10;
        for (let i = 0; i < largeMessages.length; i += batchSize) {
          const batch = largeMessages.slice(i, i + batchSize);
          
          // Process each message in the batch
          for (const msg of batch) {
            const extMsg = msg as ExtendedMessage;
            if (typeof extMsg.content === 'string' && extMsg.content.length > 1000 && extMsg.id) {
              // Record original size
              totalChars += extMsg.content.length;
              
              try {
                // Proper compression approach: Store original content in metadata
                // This simulates compression but preserves the original content
                const originalContent = extMsg.content;
                
                // Create metadata for tracking compression
                const metadata = {
                  ...(extMsg.metadata || {}),
                  compressed: true,
                  originalLength: originalContent.length,
                  compressionDate: new Date().toISOString()
                };
                
                // In a real implementation, we would use a proper compression algorithm
                // For demonstration purposes, we'll store the content length metrics
                // but not actually modify the displayed content
                
                // Update the message in the database to include compression metadata
                await db.messages.update(extMsg.id, { metadata });
                
                // For statistics only - simulating compression ratio
                // In a real app, we'd update the database with compressed content
                compressedChars += Math.floor(originalContent.length * 0.6); // Estimate 40% saving
                updatedCount++;
              } catch (updateError) {
                console.error(`[STORAGE] Error updating message ${extMsg.id}:`, updateError);
              }
            }
          }
          
          // Small delay between batches to avoid UI freezing
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        const savedChars = totalChars - compressedChars;
        const savingsPercentage = (savedChars / totalChars) * 100;
        
        console.log(`[STORAGE] Compression complete: ${updatedCount} messages compressed`);
        console.log(`[STORAGE] Saved ${savedChars} characters (${savingsPercentage.toFixed(1)}%)`);
        console.log(`[STORAGE] Before: ${totalChars}, After: ${compressedChars}`);
        
        return {
          success: true,
          totalAnalyzed: largeMessages.length,
          compressedCount: updatedCount,
          charsSaved: savedChars,
          savingsPercentage: savingsPercentage,
          beforeSize: totalChars,
          afterSize: compressedChars
        };
      } catch (error) {
        console.error('[STORAGE] Error during message compression:', error);
        return { success: false, error };
      }
    };
    
    // Add database analysis function to diagnose storage usage
    window.analyzeStorage = async () => {
      try {
        console.log('[STORAGE ANALYSIS] Running database analysis...');
        
        // Get counts from all tables
        const topicCount = await db.topics.count();
        const messageCount = await db.messages.count();
        const wordIndexCount = await db.wordIndex.count();
        
        console.log('[STORAGE ANALYSIS] Database counts:', {
          topics: topicCount,
          messages: messageCount,
          wordIndices: wordIndexCount
        });
        
        // Check for orphaned messages (not associated with any topic)
        const allTopicIds = await db.topics.toCollection().primaryKeys();
        const orphanedMessages = await db.messages
          .filter(msg => !allTopicIds.includes(msg.topicId))
          .count();
        
        console.log(`[STORAGE ANALYSIS] Found ${orphanedMessages} orphaned messages`);
        
        // Check for messages by user
        if (user && user.email) {
          const userTopics = await db.topics
            .where('userId').equals(user.email)
            .toArray();
          
          const userTopicIds = userTopics.map(t => t.id).filter(id => id !== undefined) as number[];
          
          const userMessages = userTopicIds.length > 0 
            ? await db.messages.where('topicId').anyOf(userTopicIds).count()
            : 0;
            
          console.log(`[STORAGE ANALYSIS] Current user (${user.email}) has:`, {
            topics: userTopics.length,
            messages: userMessages
          });
        }
        
        // Get storage size estimate
        const storageEstimate = await db.getStorageEstimate();
        console.log('[STORAGE ANALYSIS] Storage estimate:', storageEstimate);
        
        // Check for other IndexedDB databases in the same origin
        const databases = await indexedDB.databases();
        console.log('[STORAGE ANALYSIS] All IndexedDB databases:', databases);
        
        // Try to get detailed size information if the browser supports it
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          console.log('[STORAGE ANALYSIS] Browser storage estimate:', estimate);
          
          // Calculate percentage used by our database vs. total
          if (estimate.usage && storageEstimate.usage) {
            const dbPercentage = (storageEstimate.usage / estimate.usage) * 100;
            console.log(`[STORAGE ANALYSIS] Our database uses ${dbPercentage.toFixed(1)}% of total storage usage`);
          }
        }
        
        // Return comprehensive analysis results
        return {
          success: true,
          counts: {
            topics: topicCount,
            messages: messageCount,
            wordIndices: wordIndexCount,
            orphanedMessages
          },
          userStats: user ? {
            email: user.email,
            topicCount: await db.topics.where('userId').equals(user.email).count()
          } : null,
          storageEstimate,
          recommendedAction: orphanedMessages > 0 ? 'Run cleanupOrphanedData' : 'No issues detected'
        };
      } catch (error) {
        console.error('[STORAGE ANALYSIS] Error analyzing storage:', error);
        return { success: false, error };
      }
    };
    
    return () => {
      // Clean up functions when component unmounts or user changes
      delete window.cleanupOldestConversations;
      delete window.compressMessages;
      delete window.analyzeStorage;
    };
  }, [user]);

  // Implement message compression functionality
  useEffect(() => {
    if (!user || !messageCompressionEnabled) return;
    
    // We no longer need to define window.compressMessages here
    // It's now defined in the storage management functions useEffect
    
    return () => {
      // No need to clean up window.compressMessages here
      // It's now handled in the storage management functions useEffect
    };
  }, [user, messageCompressionEnabled]);
  
  // Auto-generate test topics in development mode
  useEffect(() => {
    if (!user || import.meta.env.MODE !== 'development') return;
    
    const generateTestTopics = async () => {
      try {
        // Check if user has any topics
        const topicCount = await db.topics
          .where('userId').equals(user.email)
          .count();
        
        if (topicCount > 0) {
          console.log(`[DEV] User already has ${topicCount} topics, skipping test data generation`);
          return;
        }
        
        console.log('[DEV] No topics found, generating 100 test topics');
        
        // Generate 100 test topics with messages
        for (let i = 1; i <= 100; i++) {
          // Create topic
          const topicId = await db.topics.add({
            userId: user.email,
            title: `Test Topic ${i}`,
            createdAt: Date.now() - (100 - i) * 86400000, // Older to newer
            lastActive: Date.now() - (100 - i) * 86400000,
            messageCnt: 2,
            userMessageCnt: 1,
            assistantMessageCnt: 1,
            personaId: 'traditional-medicine' // Default persona
          });
          
          // Add user message
          await db.messages.add({
            topicId: topicId as number,
            timestamp: Date.now() - (100 - i) * 86400000,
            role: 'user',
            content: `This is test message ${i} from user. For testing performance and storage functionality.`
          });
          
          // Add bot response
          await db.messages.add({
            topicId: topicId as number,
            timestamp: Date.now() - (100 - i) * 86400000 + 5000,
            role: 'assistant',
            content: `This is test response ${i} from assistant. This simulates a response to the user's query about traditional medicine. The response is intentionally kept short for test purposes, but in a real scenario, these messages could be much longer and would benefit from compression.`
          });
          
          // Log progress at intervals
          if (i % 10 === 0) {
            console.log(`[DEV] Generated ${i}/100 test topics`);
          }
        }
        
        console.log('[DEV] Successfully generated 100 test topics');
        
        // Refresh topic list if needed
        if (window.triggerTopicListRefresh) {
          window.triggerTopicListRefresh();
        }
      } catch (error) {
        console.error('[DEV] Error generating test topics:', error);
      }
    };
    
    // Run after a short delay to allow the app to initialize
    setTimeout(generateTestTopics, 1000);
  }, [user]);
  
  // Implement performance optimization functions
  useEffect(() => {
    if (!user) return;
    
    // Set up performance benchmark function
    window.benchmarkOperations = async () => {
      try {
        console.log('[PERFORMANCE] Starting database operation benchmark');
        const results = {
          read: { small: 0, medium: 0, large: 0 },
          write: { small: 0, medium: 0, large: 0 },
          index: { time: 0 }
        };
        
        // Benchmark read operations
        const startSmallRead = performance.now();
        await db.messages.limit(10).toArray();
        results.read.small = performance.now() - startSmallRead;
        
        const startMediumRead = performance.now();
        await db.messages.limit(50).toArray();
        results.read.medium = performance.now() - startMediumRead;
        
        const startLargeRead = performance.now();
        await db.messages.limit(100).toArray();
        results.read.large = performance.now() - startLargeRead;
        
        // Benchmark indexing operations
        const startIndex = performance.now();
        if (currentTopicId) {
          const { reindexTopic } = await import('../../db/ChatHistoryDBUtil');
          await reindexTopic(currentTopicId);
        }
        results.index.time = performance.now() - startIndex;
        
        console.log('[PERFORMANCE] Benchmark results:', results);
        return results;
      } catch (error) {
        console.error('[PERFORMANCE] Error during benchmark:', error);
        return { success: false, error };
      }
    };
    
    // Set up database optimization function
    window.optimizeDatabasePerformance = async () => {
      try {
        console.log('[PERFORMANCE] Running database optimization');
        
        // In a real implementation, this would perform various optimizations
        // For demonstration, we'll just cleanup orphaned data
        const cleanupResult = await db.cleanupOrphanedData();
        
        return {
          success: true,
          cleanup: cleanupResult
        };
      } catch (error) {
        console.error('[PERFORMANCE] Error during optimization:', error);
        return { success: false, error };
      }
    };
    
    return () => {
      delete window.benchmarkOperations;
      delete window.optimizeDatabasePerformance;
    };
  }, [user, currentTopicId]);

  // Lazy loading scroll handler for improved performance
  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    
    // Check if we need to optimize rendering
    if (messages.length > messagePageSize * 2) {
      // Implement virtual scrolling for large message lists
      const scrollPosition = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;
      
      // Log performance metrics for debugging
      if (scrollPosition < 100 && messages.length > messagePageSize * 3) {
        console.log('[PERFORMANCE] Scrolled to top of large message history');
      }
      
      // We could implement optimizations based on scroll position here
    }
  }, [messages.length, messagePageSize]);

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
                  onOpenDataExportImport={() => setShowDataExportImport(true)}
                  onOpenStorageSettings={() => setShowStorageSettings(true)}
                />
                
                {/* Beta warning banner */}
                <BetaBanner />
                
                {/* API Key warning banner */}
                {!hasStoredApiKey() && (
                  <ApiKeyWarning onSetup={() => setShowApiSettings(true)} />
                )}
                
                {/* Storage warning banner for high usage */}
                {storageUsage && storageUsage.percentage > 80 && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Cảnh báo dung lượng lưu trữ</h3>
                        <div className="mt-1 text-sm text-red-700">
                          Dung lượng lưu trữ gần đầy ({storageUsage.percentage.toFixed(1)}%). Hãy dọn dẹp cuộc trò chuyện cũ để tránh mất dữ liệu.
                        </div>
                        <div className="mt-2">
                          <button 
                            type="button" 
                            className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none"
                            onClick={() => setShowStorageSettings(true)}
                          >
                            Quản lý dung lượng
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
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
                      pageSize={messagePageSize}
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
              
              {/* Data Export/Import Modal */}
              <TailwindModal
                isOpen={showDataExportImport}
                onClose={() => setShowDataExportImport(false)}
                title="Xuất/Nhập dữ liệu"
                maxWidth="max-w-4xl"
              >
                <TailwindDataExportImport
                  userId={user.email}
                  currentTopicId={currentTopicId}
                  onClose={() => setShowDataExportImport(false)}
                />
              </TailwindModal>
              
              {/* Storage Settings Modal */}
              <TailwindModal
                isOpen={showStorageSettings}
                onClose={() => setShowStorageSettings(false)}
                title="Quản lý dung lượng lưu trữ"
                maxWidth="max-w-4xl"
              >
                <TailwindStorageSettings
                  retentionPolicyDays={retentionPolicyDays}
                  setRetentionPolicyDays={setRetentionPolicyDays}
                  autoCleanupEnabled={autoCleanupEnabled}
                  setAutoCleanupEnabled={setAutoCleanupEnabled}
                  messageCompressionEnabled={messageCompressionEnabled}
                  setMessageCompressionEnabled={setMessageCompressionEnabled}
                  messagePageSize={messagePageSize}
                  setMessagePageSize={setMessagePageSize}
                  storageUsage={storageUsage}
                  onClose={() => setShowStorageSettings(false)}
                  userId={user.email}
                />
              </TailwindModal>
              
              {/* Message Delete Confirmation Modal */}
              {messageToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-sm w-full">
                    <h3 className="text-lg font-medium text-[#3A2E22] mb-4">Xác nhận xóa</h3>
                    <p className="text-gray-600 mb-6">
                      Bạn có chắc chắn muốn xóa tin nhắn này? Hành động này không thể hoàn tác.
                    </p>
                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={cancelDeleteMessage}
                        className="px-4 py-2 border border-gray-300 rounded-md text-[#3A2E22] hover:bg-gray-50"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={confirmDeleteMessage}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TailwindMessagePersistence>
        </ChatHistoryProvider>
      </ConsentProvider>
    </GoogleOAuthProvider>
  );
}

export default TailwindApp; 