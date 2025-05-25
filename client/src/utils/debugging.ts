/**
 * Utility for debugging with consistent formatting
 */
export const debugLogger = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${category} ${timestamp}] ${message}${data !== undefined ? ': ' + JSON.stringify(data) : ''}`);
};

/**
 * Add debugging functions to the window object
 * @param getCurrentPersonaId - Function to get current persona ID
 * @param absoluteForcePersona - Function to force a persona
 * @param debugPersonaSystem - Function to debug persona system
 * @param checkTopicPersonaConsistency - Function to check topic/persona consistency
 * @param fixTopicPersonas - Function to fix topic personas
 * @param exportTopic - Function to export topic data
 * @param testTitleExtraction - Function to test title extraction
 */
export const setupWindowDebugFunctions = (
  getCurrentPersonaId: () => string,
  absoluteForcePersona: (personaId: string) => void,
  debugPersonaSystem?: () => Promise<any>,
  checkTopicPersonaConsistency?: () => Promise<any>,
  fixTopicPersonas?: (defaultPersona?: string) => Promise<any>,
  exportTopic?: (topicId: number) => Promise<any>,
  testTitleExtraction?: (text: string) => string
) => {
  window.getCurrentPersonaId = getCurrentPersonaId;
  window.absoluteForcePersona = absoluteForcePersona;
  
  if (debugPersonaSystem) {
    window.debugPersonaSystem = debugPersonaSystem;
  }
  
  if (checkTopicPersonaConsistency) {
    window.checkTopicPersonaConsistency = checkTopicPersonaConsistency;
  }
  
  if (fixTopicPersonas) {
    window.fixTopicPersonas = fixTopicPersonas;
  }
  
  if (exportTopic) {
    window.exportTopic = exportTopic;
  }
  
  if (testTitleExtraction) {
    window.testTitleExtraction = testTitleExtraction;
  }
  
  // Return a cleanup function
  return () => {
    delete window.getCurrentPersonaId;
    delete window.absoluteForcePersona;
    delete window.debugPersonaSystem;
    delete window.checkTopicPersonaConsistency;
    delete window.fixTopicPersonas;
    delete window.exportTopic;
    delete window.testTitleExtraction;
  };
}; 