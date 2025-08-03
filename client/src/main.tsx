import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AppSelector from './AppSelector';
import { PersonaProvider } from './contexts/PersonaContext';
import { ChatHistoryProvider } from './contexts/ChatHistoryContext';
import { ConsentProvider } from './contexts/ConsentContext';
import { ApiKeyProvider } from './contexts/ApiKeyContext';
import { UnleashProvider } from './contexts/UnleashContext';
import { ModalProvider } from './contexts/ModalContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { DataProvider } from './contexts/DataContext';

console.log('Main.tsx initializing - rendering AppSelector with providers');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UnleashProvider>
      <ApiKeyProvider>
        <ChatHistoryProvider>
          <PersonaProvider>
            <ConsentProvider>
              <LoadingProvider>
                <DataProvider>
                  <ModalProvider>
                    <AppSelector />
                  </ModalProvider>
                </DataProvider>
              </LoadingProvider>
            </ConsentProvider>
          </PersonaProvider>
        </ChatHistoryProvider>
      </ApiKeyProvider>
    </UnleashProvider>
  </React.StrictMode>,
); 