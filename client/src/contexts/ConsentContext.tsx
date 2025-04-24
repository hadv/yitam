import { createContext, useContext, useState, ReactNode } from 'react';

interface ConsentContextType {
  hasAcceptedTerms: boolean;
  setHasAcceptedTerms: (value: boolean) => void;
  showConsentModal: boolean;
  setShowConsentModal: (value: boolean) => void;
}

const ConsentContext = createContext<ConsentContextType | undefined>(undefined);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => {
    const stored = localStorage.getItem('hasAcceptedTerms');
    return stored === 'true';
  });
  const [showConsentModal, setShowConsentModal] = useState(false);

  const updateConsent = (value: boolean) => {
    setHasAcceptedTerms(value);
    localStorage.setItem('hasAcceptedTerms', String(value));
  };

  return (
    <ConsentContext.Provider value={{ 
      hasAcceptedTerms, 
      setHasAcceptedTerms: updateConsent,
      showConsentModal,
      setShowConsentModal
    }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const context = useContext(ConsentContext);
  if (context === undefined) {
    throw new Error('useConsent must be used within a ConsentProvider');
  }
  return context;
} 