import React from 'react';
import './App.css';
import TailwindApp from './components/tailwind/TailwindApp';
import { PersonaProvider } from './contexts/PersonaContext';

function App() {
  return (
    <PersonaProvider>
      <TailwindApp />
    </PersonaProvider>
  );
}

export default App; 