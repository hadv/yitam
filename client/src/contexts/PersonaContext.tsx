import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AVAILABLE_PERSONAS } from '../components/tailwind/TailwindPersonaSelector';

// Define the context shape
interface PersonaContextType {
  currentPersonaId: string;
  setCurrentPersonaId: (id: string) => void;
  isPersonaLocked: boolean;
  setIsPersonaLocked: (locked: boolean) => void;
  resetPersona: () => void;
  forceSetPersona: (id: string) => void;
  saveDefaultPersona: (id: string) => void;
  absoluteForcePersona: (id: string) => void;
}

// Create the context with default values
const PersonaContext = createContext<PersonaContextType>({
  currentPersonaId: 'yitam',
  setCurrentPersonaId: () => {},
  isPersonaLocked: false,
  setIsPersonaLocked: () => {},
  resetPersona: () => {},
  forceSetPersona: () => {},
  saveDefaultPersona: () => {},
  absoluteForcePersona: () => {},
});

// Hook for consuming the context
export const usePersona = () => useContext(PersonaContext);

interface PersonaProviderProps {
  children: ReactNode;
}

// Check if a persona ID is valid
const isValidPersona = (personaId: string | null): boolean => {
  if (!personaId) return false;
  return AVAILABLE_PERSONAS.some(p => p.id === personaId);
};

// Provider component
export const PersonaProvider: React.FC<PersonaProviderProps> = ({ children }) => {
  // CRITICAL FIX: More robust initialization from localStorage with fallback to 'yitam'
  const [currentPersonaId, setCurrentPersonaId] = useState<string>(() => {
    try {
      // Get from localStorage
      const storedPersona = localStorage.getItem('selectedPersonaId');
      
      // Check if the stored persona is valid
      if (storedPersona && isValidPersona(storedPersona)) {
        console.log(`[PERSONA CONTEXT] Loaded valid persona from localStorage: ${storedPersona}`);
        return storedPersona;
      } else {
        // If persona is invalid or missing, use default and save it
        console.log(`[PERSONA CONTEXT] Invalid or missing persona in localStorage (${storedPersona}), using default: yitam`);
        localStorage.setItem('selectedPersonaId', 'yitam');
        return 'yitam';
      }
    } catch (error) {
      console.error('[PERSONA CONTEXT] Error loading persona from localStorage:', error);
      try {
        // Attempt to reset localStorage
        localStorage.setItem('selectedPersonaId', 'yitam');
      } catch (e) {
        console.error('[PERSONA CONTEXT] Failed to set default persona in localStorage:', e);
      }
      return 'yitam'; // Default value
    }
  });

  const [isPersonaLocked, setIsPersonaLocked] = useState<boolean>(false);
  const [lastSelected, setLastSelected] = useState<number>(Date.now());
  // Track if we're changing the persona due to a topic selection
  const [isTopicChange, setIsTopicChange] = useState<boolean>(false);

  // Update localStorage ONLY when persona changes in the UI (not due to topic selection)
  useEffect(() => {
    if (!isTopicChange) {
      try {
        // Ensure we're saving a valid persona ID
        if (isValidPersona(currentPersonaId)) {
          console.log(`[PERSONA CONTEXT] Saving default persona to localStorage: ${currentPersonaId}`);
          localStorage.setItem('selectedPersonaId', currentPersonaId);
        } else {
          console.error(`[PERSONA CONTEXT] Attempted to save invalid persona ID: ${currentPersonaId}`);
          // Reset to default if invalid
          setCurrentPersonaId('yitam');
          localStorage.setItem('selectedPersonaId', 'yitam');
        }
      } catch (error) {
        console.error('[PERSONA CONTEXT] Error saving persona to localStorage:', error);
      }
    }
    setLastSelected(Date.now());
  }, [currentPersonaId, isTopicChange]);

  // Debug when locked state changes
  useEffect(() => {
    console.log(`[PERSONA CONTEXT] Persona locked state changed to: ${isPersonaLocked}`);
  }, [isPersonaLocked]);

  // Function to update persona for UI selection
  const updatePersona = (id: string) => {
    if (!id || !isValidPersona(id)) {
      console.error(`[PERSONA CONTEXT] Attempted to update to invalid persona ID: ${id}`);
      return;
    }
    
    if (isPersonaLocked) {
      console.log(`[PERSONA CONTEXT] Cannot change persona - locked. Attempted: ${id}`);
      return;
    }
    console.log(`[PERSONA CONTEXT] Updating persona to: ${id}`);
    setIsTopicChange(false); // This is a user selection, not a topic change
    setCurrentPersonaId(id);
  };

  // Function to force set persona for topic selection
  const forceSetPersona = useCallback((id: string) => {
    if (!id) {
      console.error(`[PERSONA CONTEXT] Cannot force set empty persona ID`);
      return;
    }
    
    // Extra validation to ensure the persona ID is valid
    const isValidPersona = AVAILABLE_PERSONAS.some(p => p.id === id);
    if (!isValidPersona) {
      console.error(`[PERSONA CONTEXT] Attempted to force set invalid persona ID: ${id}`);
      return;
    }
    
    console.log(`[PERSONA CONTEXT] Force setting persona to: ${id} (topic selection)`);
    setIsTopicChange(true); // Mark this as a topic change
    
    // CRITICAL FIX: Add additional debug for persona state changes
    console.log(`[PERSONA CONTEXT] Current persona before force: ${currentPersonaId}, changing to: ${id}`);
    
    // Force update the state even if locked
    setCurrentPersonaId(id);
    setLastSelected(Date.now());
    
    // Add a verification to confirm the state was updated
    setTimeout(() => {
      console.log(`[PERSONA CONTEXT] Verification - persona after force set should be: ${id}`);
    }, 10);
  }, [currentPersonaId]);

  // Add a new method that absolutely forces the persona ID with no restrictions
  // This is needed for topic switching to work correctly
  const absoluteForcePersona = useCallback((id: string) => {
    if (!id) {
      console.error(`[PERSONA CONTEXT] ABSOLUTE FORCE: Cannot set empty persona ID`);
      return;
    }
    
    // Validate the persona ID
    const isValidPersona = AVAILABLE_PERSONAS.some(p => p.id === id);
    if (!isValidPersona) {
      console.error(`[PERSONA CONTEXT] ABSOLUTE FORCE: Invalid persona ID: ${id}`);
      return;
    }
    
    console.log(`[PERSONA CONTEXT] ABSOLUTE FORCE: Setting persona to ${id} regardless of lock state`);
    
    // Directly set state with React.useState setter to ensure it updates
    setCurrentPersonaId(id);
    
    // Log the change
    console.log(`[PERSONA CONTEXT] ABSOLUTE FORCE: Changed from ${currentPersonaId} to ${id}`);
    
    // Set a verification timeout
    setTimeout(() => {
      if (currentPersonaId !== id) {
        console.error(`[PERSONA CONTEXT] CRITICAL ERROR: Persona not updated correctly`);
        // Try one more time
        setCurrentPersonaId(id);
      } else {
        console.log(`[PERSONA CONTEXT] ABSOLUTE FORCE: Verification successful - persona is now ${id}`);
      }
    }, 50);
  }, [currentPersonaId]);

  // Function to explicitly save a persona as the default
  const saveDefaultPersona = useCallback((id: string) => {
    if (!id) {
      console.error(`[PERSONA CONTEXT] Cannot save empty persona ID as default`);
      return;
    }
    
    // Validate the persona ID
    if (!isValidPersona(id)) {
      console.error(`[PERSONA CONTEXT] Cannot save invalid persona ID as default: ${id}`);
      return;
    }
    
    console.log(`[PERSONA CONTEXT] Saving persona as default: ${id}`);
    try {
      localStorage.setItem('selectedPersonaId', id);
      
      // CRITICAL FIX: Also update the state to match
      setIsTopicChange(false); // This is a user selection
      setCurrentPersonaId(id);
    } catch (error) {
      console.error('[PERSONA CONTEXT] Error saving default persona:', error);
    }
  }, []);

  // Function to reset persona to default
  const resetPersona = useCallback(() => {
    console.log('[PERSONA CONTEXT] Resetting persona and unlocking');
    setIsPersonaLocked(false);
    setIsTopicChange(false); // This is a reset, not a topic change
    
    // Get the default persona from localStorage
    try {
      const storedPersona = localStorage.getItem('selectedPersonaId');
      if (storedPersona && isValidPersona(storedPersona)) {
        console.log(`[PERSONA CONTEXT] Resetting to stored default persona: ${storedPersona}`);
        setCurrentPersonaId(storedPersona);
      } else {
        console.log(`[PERSONA CONTEXT] No valid stored default, resetting to yitam`);
        setCurrentPersonaId('yitam');
        localStorage.setItem('selectedPersonaId', 'yitam');
      }
    } catch (error) {
      console.error('[PERSONA CONTEXT] Error during persona reset:', error);
      setCurrentPersonaId('yitam');
      try {
        localStorage.setItem('selectedPersonaId', 'yitam');
      } catch (e) {
        console.error('[PERSONA CONTEXT] Failed to reset localStorage:', e);
      }
    }
  }, []);

  // Patch indexedDB to ensure proper persona ID is set when creating topics
  useEffect(() => {
    const patchIndexedDB = () => {
      // Store the original open method
      const originalOpen = indexedDB.open;
      
      // Override the open method with proper typing
      (indexedDB as any).open = function(name: string, version?: number) {
        const request = originalOpen.call(this, name, version);
        
        request.addEventListener('success', function() {
          // Only hook if this is the chat history database
          if (name && name.includes('chat')) {
            console.log(`[PERSONA CONTEXT] Database opened: ${name}`);
            
            // Hook transaction creation
            const originalTransaction = request.result.transaction;
            // Cast the function to avoid TypeScript errors with args
            request.result.transaction = function(
              storeNames: string | string[], 
              mode?: IDBTransactionMode, 
              options?: IDBTransactionOptions
            ) {
              // Use proper parameters to call original
              const tx = originalTransaction.call(this, storeNames, mode, options);
              
              const storeNamesArray = Array.isArray(storeNames) ? storeNames : [storeNames];
              if (storeNamesArray.includes('topics')) {
                console.log('[PERSONA CONTEXT] Topics transaction created');
                
                // Hook objectStore access
                const originalObjectStore = tx.objectStore;
                tx.objectStore = function(storeName: string) {
                  const store = originalObjectStore.call(this, storeName);
                  
                  if (storeName === 'topics') {
                    // Hook the add and put methods
                    const originalAdd = store.add;
                    store.add = function(value: any, key?: IDBValidKey) {
                      if (value && !value.personaId) {
                        console.log(`[PERSONA CONTEXT] Setting personaId in topic add to: ${currentPersonaId}`);
                        value.personaId = currentPersonaId;
                      }
                      return originalAdd.call(this, value, key);
                    };
                    
                    const originalPut = store.put;
                    store.put = function(value: any, key?: IDBValidKey) {
                      if (value && !value.personaId) {
                        console.log(`[PERSONA CONTEXT] Setting personaId in topic put to: ${currentPersonaId}`);
                        value.personaId = currentPersonaId;
                      }
                      return originalPut.call(this, value, key);
                    };
                  }
                  
                  return store;
                };
              }
              
              return tx;
            };
          }
        });
        
        return request;
      };
    };

    // Patch fetch API to ensure persona ID is included in API requests
    const patchFetch = () => {
      const originalFetch = window.fetch;
      window.fetch = function(resource: RequestInfo | URL, init?: RequestInit) {
        // Check if this is a request that might create a topic
        if (typeof resource === 'string' && 
            (resource.includes('/api/topics') || resource.includes('/chat'))) {
          
          console.log(`[PERSONA CONTEXT] Intercepted fetch request to: ${resource}`);
          
          // If there's a request body, try to modify it
          if (init && init.body && typeof init.body === 'string') {
            try {
              const body = JSON.parse(init.body);
              
              // If the request doesn't include a personaId, add it
              if (!body.personaId) {
                body.personaId = currentPersonaId;
                console.log(`[PERSONA CONTEXT] Adding persona ID to fetch request: ${body.personaId}`);
                
                // Update the request with the modified body
                init.body = JSON.stringify(body);
              }
            } catch (e) {
              // Not JSON or other error, ignore
            }
          }
        }
        
        return originalFetch.call(this, resource, init);
      };
    };

    // Apply the patches
    patchIndexedDB();
    patchFetch();

    // No cleanup needed as we want these patches to persist
  }, [currentPersonaId]);

  // Context value
  const value: PersonaContextType = {
    currentPersonaId,
    setCurrentPersonaId: updatePersona,
    isPersonaLocked,
    setIsPersonaLocked,
    resetPersona,
    forceSetPersona,
    saveDefaultPersona,
    absoluteForcePersona,
  };

  return (
    <PersonaContext.Provider value={value}>
      {children}
    </PersonaContext.Provider>
  );
};

export default PersonaContext; 