import React from 'react';
import ReactDOM from 'react-dom/client';
import AppSelector from './AppSelector';
import { UnleashProvider } from './contexts/UnleashContext';
import './index.css';

console.log('Main.tsx initializing - rendering AppSelector with UnleashProvider');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UnleashProvider>
      <AppSelector />
    </UnleashProvider>
  </React.StrictMode>
); 