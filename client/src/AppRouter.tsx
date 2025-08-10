import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TailwindApp from './components/tailwind/TailwindApp';
import SharedConversationViewer from './components/shared/SharedConversationViewer';
import QigongManagement from './components/qigong/QigongManagement';
import { SharedConversationCacheProvider } from './contexts/SharedConversationCacheContext';

const AppRouter: React.FC = () => {
  return (
    <SharedConversationCacheProvider
      maxCacheSize={150}
      defaultTTL={60 * 60 * 1000} // 1 hour
      enableAutoCleanup={true}
      cleanupIntervalMinutes={30}
    >
      <Routes>
        {/* Main authenticated app */}
        <Route path="/" element={<TailwindApp />} />

        {/* Public shared conversation viewer */}
        <Route path="/shared/:shareId" element={<SharedConversationViewer />} />

        {/* Qigong management page with access code protection */}
        <Route path="/qigong" element={<QigongManagement />} />

        {/* Catch all route - redirect to main app */}
        <Route path="*" element={<TailwindApp />} />
      </Routes>
    </SharedConversationCacheProvider>
  );
};

export default AppRouter;
