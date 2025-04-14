import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { unleashClient, FEATURE_FLAGS, initUnleash, isFeatureEnabled } from '../unleashConfig';

interface UnleashContextType {
  isUnleashReady: boolean;
  useTailwindUI: boolean;
}

const UnleashContext = createContext<UnleashContextType>({
  isUnleashReady: false,
  useTailwindUI: true,
});

export const useUnleash = () => useContext(UnleashContext);

interface UnleashProviderProps {
  children: ReactNode;
}

export const UnleashProvider: React.FC<UnleashProviderProps> = ({ children }) => {
  const [isUnleashReady, setIsUnleashReady] = useState(false);
  const [useTailwindUI, setUseTailwindUI] = useState(true);

  useEffect(() => {
    let mounted = true;
    let updateListenerAttached = false;

    const setupUnleash = async () => {
      try {
        console.log('Initializing Unleash...');
        const success = await initUnleash();
        
        if (success && mounted) {
          console.log('Unleash initialization: success');
          setIsUnleashReady(true);
          
          // Check if Tailwind UI is enabled
          const tailwindEnabled = isFeatureEnabled(FEATURE_FLAGS.TAILWIND_UI);
          console.log('Tailwind UI flag value from Unleash:', tailwindEnabled);
          
          // Actually use the flag value from Unleash
          setUseTailwindUI(tailwindEnabled);
          
          // Subscribe to updates
          if (!updateListenerAttached) {
            unleashClient.on('update', () => {
              if (mounted) {
                console.log('Unleash received update event');
                const newTailwindEnabled = isFeatureEnabled(FEATURE_FLAGS.TAILWIND_UI);
                console.log('Unleash update - Tailwind UI enabled:', newTailwindEnabled);
                setUseTailwindUI(newTailwindEnabled);
              }
            });
            
            // Also listen for errors
            unleashClient.on('error', (error: Error) => {
              console.error('Unleash client error:', error);
              if (mounted) {
                setIsUnleashReady(false);
              }
            });
            
            updateListenerAttached = true;
          }
        } else if (mounted) {
          // If Unleash fails, mark it as not ready but ensure we use Tailwind UI as fallback
          console.log('Unleash initialization failed, using Tailwind UI as fallback');
          setIsUnleashReady(false);
          setUseTailwindUI(true);
        }
      } catch (error) {
        // If Unleash errors, ensure we use Tailwind UI
        console.error('Error initializing Unleash:', error);
        if (mounted) {
          console.log('Unleash error, using Tailwind UI as fallback');
          setIsUnleashReady(false);
          setUseTailwindUI(true);
        }
      }
    };
    
    setupUnleash();
    
    return () => {
      mounted = false;
      if (isUnleashReady) {
        unleashClient.stop();
      }
    };
  }, []);

  console.log('Current UI state:', { isUnleashReady, useTailwindUI });

  return (
    <UnleashContext.Provider value={{ isUnleashReady, useTailwindUI }}>
      {children}
    </UnleashContext.Provider>
  );
}; 