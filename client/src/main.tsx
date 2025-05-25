import React from 'react';
import ReactDOM from 'react-dom/client';
import AppSelector from './AppSelector';
import { UnleashProvider } from './contexts/UnleashContext';
import { ChatHistoryProvider } from './contexts/ChatHistoryContext';
import { PersonaProvider } from './contexts/PersonaContext';
import './index.css';

console.log('Main.tsx initializing - rendering AppSelector with providers');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UnleashProvider>
      <ChatHistoryProvider>
        <PersonaProvider>
          <AppSelector />
        </PersonaProvider>
      </ChatHistoryProvider>
    </UnleashProvider>
  </React.StrictMode>
); 