import React from 'react';
import ReactDOM from 'react-dom/client';
import AppSelector from './AppSelector';
import { UnleashProvider } from './contexts/UnleashContext';
import { ChatHistoryProvider } from './contexts/ChatHistoryContext';
import './index.css';

console.log('Main.tsx initializing - rendering AppSelector with providers');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UnleashProvider>
      <ChatHistoryProvider>
        <AppSelector />
      </ChatHistoryProvider>
    </UnleashProvider>
  </React.StrictMode>
); 