import React, { useEffect } from 'react';
import { useUnleash } from './contexts/UnleashContext';
import OriginalApp from './App';
import TailwindApp from './components/tailwind/TailwindApp';

const AppSelector: React.FC = () => {
  const { useTailwindUI } = useUnleash();
  
  // Debug which UI is being selected
  useEffect(() => {
    console.log('AppSelector rendering, useTailwindUI:', useTailwindUI);
  }, [useTailwindUI]);
  
  // When useTailwindUI is true, show TailwindApp
  return useTailwindUI ? <TailwindApp /> : <OriginalApp />;
};

export default AppSelector; 