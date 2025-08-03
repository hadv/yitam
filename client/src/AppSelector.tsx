import React, { useEffect } from 'react';
import { useUnleash } from './contexts/UnleashContext';
import OriginalApp from './App';
import AppRouter from './AppRouter';

const AppSelector: React.FC = () => {
  const { useTailwindUI } = useUnleash();

  // Debug which UI is being selected
  useEffect(() => {
    console.log('AppSelector rendering, useTailwindUI:', useTailwindUI);
  }, [useTailwindUI]);

  // When useTailwindUI is true, show AppRouter (with TailwindApp and shared conversation viewer)
  return useTailwindUI ? <AppRouter /> : <OriginalApp />;
};

export default AppSelector; 