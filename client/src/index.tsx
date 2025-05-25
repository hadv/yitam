//CRITICAL: Import the persona debugger
import './db/personaDebugger';

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { PersonaProvider } from './contexts/PersonaContext';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <PersonaProvider>
      <App />
    </PersonaProvider>
  </React.StrictMode>
); 