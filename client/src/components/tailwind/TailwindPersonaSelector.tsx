import React, { useState, useEffect } from 'react';
import { usePersona } from '../../contexts/PersonaContext';

export interface Persona {
  id: string;
  displayName: string;
  description: string;
  domains: string[];
  voiceTone: {
    style: string;
    characteristics: string[];
  };
}

interface TailwindPersonaSelectorProps {
  socket: any;
}

// Hard-coded personas based on GitHub issue #56
export const AVAILABLE_PERSONAS: Persona[] = [
  {
    id: 'yitam',
    displayName: 'Yitam',
    description: 'Trợ lý thông minh với kiến thức tổng hợp',
    domains: [], // No fixed domains (flexible search across all available domains)
    voiceTone: {
      style: 'Neutral and adaptable',
      characteristics: [
        'Clear and contemporary language',
        'Professional yet approachable style',
        'Context-aware responses'
      ]
    }
  },
  {
    id: 'lan-ong',
    displayName: 'Lãn Ông',
    description: 'Danh y nổi tiếng với kiệt tác "Y Tông Tâm Lĩnh"',
    domains: ['y tông tâm lĩnh', 'hải thượng lãn ông'],
    voiceTone: {
      style: 'Traditional Vietnamese medical scholar',
      characteristics: [
        'Traditional Vietnamese medical terminology',
        'Formal and scholarly tone',
        'Use of classical Vietnamese expressions',
        'Integration of traditional medical analogies'
      ]
    }
  },
  {
    id: 'vien-minh',
    displayName: 'HT. Viên Minh',
    description: 'Thiền sư Việt Nam chuyên về giáo lý Phật giáo',
    domains: ['đạo phật', 'viên minh'],
    voiceTone: {
      style: 'Contemplative Buddhist teacher',
      characteristics: [
        'Buddhist terminology and concepts',
        'Contemplative and mindful tone',
        'Use of dharma teaching style',
        'Integration of meditation and mindfulness perspectives'
      ]
    }
  },
  {
    id: 'lao-tu',
    displayName: 'Lão Tử',
    description: 'Triết gia Trung Hoa cổ đại, tác giả của "Đạo Đức Kinh"',
    domains: ['lão kinh', 'lão tử'],
    voiceTone: {
      style: 'Classical Taoist philosopher',
      characteristics: [
        'Classical Chinese philosophical style',
        'Use of paradoxical wisdom',
        'Metaphorical and poetic expression',
        'Integration of Taoist concepts and principles'
      ]
    }
  },
  {
    id: 'lien-tam',
    displayName: 'Liên Tâm Lão Nhân',
    description: 'Chuyên gia về Nội Kinh với hiểu biết sâu sắc về y học cổ đại',
    domains: ['nội kinh'],
    voiceTone: {
      style: 'Scholarly classical medical expert',
      characteristics: [
        'Traditional medical terminology',
        'Detailed analytical approach',
        'Classical references and citations',
        'Integration of philosophical and medical concepts'
      ]
    }
  }
];

const TailwindPersonaSelector: React.FC<TailwindPersonaSelectorProps> = ({ socket }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { currentPersonaId, setCurrentPersonaId, isPersonaLocked, saveDefaultPersona } = usePersona();

  // Debug log when persona changes
  useEffect(() => {
    console.log(`[PERSONA SELECTOR] Current persona ID from context: ${currentPersonaId}`);
  }, [currentPersonaId]);

  const handlePersonaClick = (personaId: string) => {
    if (isPersonaLocked) {
      console.log(`[PERSONA SELECTOR] Cannot change persona - locked. Attempted: ${personaId}`);
      return;
    }
    console.log(`[PERSONA SELECTOR] User clicked on persona: ${personaId}`);
    
    // Use the context method to update persona
    setCurrentPersonaId(personaId);
    
    // Also save this as the default persona since it's a user selection
    saveDefaultPersona(personaId);
    
    // Log the selection
    console.log(`[PERSONA SELECTOR] Persona selected and saved as default: ${personaId}`);
    
    // Close the dropdown
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    if (isPersonaLocked) return;
    setIsOpen(!isOpen);
  };

  // Find the currently selected persona
  const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];

  return (
    <div className="relative w-64 text-sm">
      <div 
        className={`flex items-center justify-between p-2 border border-gray-300 rounded
          ${isPersonaLocked 
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
            : 'bg-white hover:bg-gray-50 cursor-pointer'}`}
        onClick={toggleDropdown}
        data-selector-type="persona"
        data-selected-persona={currentPersonaId}
      >
        <span className="font-medium">{selectedPersona.displayName}</span>
        {isPersonaLocked ? (
          <span className="text-xs ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </span>
        ) : (
          <span className="text-xs ml-2">▼</span>
        )}
      </div>
      
      {isOpen && !isPersonaLocked && (
        <div className="absolute w-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-10 max-h-72 overflow-y-auto">
          {AVAILABLE_PERSONAS.map(persona => (
            <div 
              key={persona.id}
              className={`p-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                currentPersonaId === persona.id ? 'bg-blue-50 selected' : ''
              }`}
              onClick={() => handlePersonaClick(persona.id)}
              data-persona-id={persona.id}
              data-persona-name={persona.displayName}
              data-testid={`persona-option-${persona.id}`}
              data-selected={currentPersonaId === persona.id ? 'true' : 'false'}
            >
              <div className="font-medium mb-1">{persona.displayName}</div>
              <div className="text-xs text-gray-600 truncate">{persona.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TailwindPersonaSelector; 