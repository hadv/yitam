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

    // The caller is following a topic, not expressing a preference: showing an old
    // conversation must not replace the persona the user picked for new chats.
    setIsTopicChange(true);
    setCurrentPersonaId(id);
  }, []);

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

  // This provider used to patch two globals here — `indexedDB.open`, to inject
  // `personaId` into topic writes, and `window.fetch`, to inject it into request
  // bodies. Both are gone. Topics now carry the persona explicitly from the code
  // that creates them (see `utils/topicDraft.ts` and `useMessages`), and the chat
  // request carries it as a field on the `chat-message` socket payload.

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