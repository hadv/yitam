/**
 * Types and interfaces for Bayesian Memory Management in Yitam Context Engine
 */

export interface BayesianEvidence {
  /** Semantic similarity score between current query and historical message */
  semanticSimilarity: number;
  
  /** Temporal relevance - how recent the message is */
  temporalRelevance: number;
  
  /** Entity overlap between current query and historical message */
  entityOverlap: number;
  
  /** Topic similarity score */
  topicSimilarity: number;
  
  /** User interaction patterns (if user previously referenced this message) */
  userInteractionScore: number;
  
  /** Context continuity - how well this message fits with recent context */
  contextContinuity: number;
}

export interface BayesianPrior {
  /** Base importance score of the message */
  baseImportance: number;
  
  /** Message type prior (user vs assistant) */
  messageTypePrior: number;
  
  /** Length-based prior (longer messages might be more important) */
  lengthPrior: number;
  
  /** Position in conversation prior */
  positionPrior: number;
  
  /** User-marked importance */
  userMarkedPrior: number;
}

export interface BayesianPosterior {
  /** Final probability that this message is relevant to current query */
  relevanceProbability: number;
  
  /** Confidence score in this probability */
  confidence: number;
  
  /** Breakdown of contributing factors */
  evidenceContribution: {
    semantic: number;
    temporal: number;
    entity: number;
    topic: number;
    interaction: number;
    continuity: number;
  };
  
  /** Prior contribution to final score */
  priorContribution: number;
}

export interface HistoricalMessage {
  messageId: number;
  chatId: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  tokenCount: number;
  
  /** Current importance score from existing system */
  currentImportanceScore: number;
  
  /** Extracted entities and topics */
  entities?: string[];
  topics?: string[];
  
  /** Semantic hash for quick comparison */
  semanticHash?: string;
  
  /** User interaction metadata */
  userMarked: boolean;
  timesReferenced: number;
  lastReferencedAt?: Date;
}

export interface BayesianMemoryConfig {
  /** Weights for different evidence types */
  evidenceWeights: {
    semantic: number;
    temporal: number;
    entity: number;
    topic: number;
    interaction: number;
    continuity: number;
  };
  
  /** Prior weights */
  priorWeights: {
    baseImportance: number;
    messageType: number;
    length: number;
    position: number;
    userMarked: number;
  };
  
  /** Temporal decay parameters */
  temporalDecay: {
    halfLife: number; // in hours
    minRelevance: number; // minimum temporal relevance
  };
  
  /** Similarity thresholds */
  thresholds: {
    minSemanticSimilarity: number;
    minEntityOverlap: number;
    minTopicSimilarity: number;
    minRelevanceProbability: number;
  };
  
  /** Maximum number of messages to consider for Bayesian analysis */
  maxHistorySize: number;
  
  /** Top K messages to select based on Bayesian probability */
  topKSelection: number;
}

export interface BayesianAnalysisResult {
  /** Selected messages with their Bayesian scores */
  selectedMessages: Array<{
    message: HistoricalMessage;
    bayesianScore: BayesianPosterior;
    rank: number;
  }>;
  
  /** Summary of analysis */
  analysisSummary: {
    totalMessagesAnalyzed: number;
    averageRelevanceProbability: number;
    topRelevanceProbability: number;
    processingTimeMs: number;
  };
  
  /** Context note for LLM */
  contextNote: string;
}

export interface ConversationVector {
  messageId: number;
  embedding: number[];
  metadata: {
    timestamp: Date;
    role: 'user' | 'assistant';
    tokenCount: number;
    entities: string[];
    topics: string[];
  };
}

export interface QueryAnalysis {
  /** Current query text */
  query: string;
  
  /** Query embedding */
  queryEmbedding: number[];
  
  /** Extracted entities from query */
  queryEntities: string[];
  
  /** Identified topics in query */
  queryTopics: string[];
  
  /** Query intent classification */
  queryIntent: 'question' | 'request' | 'clarification' | 'continuation' | 'new_topic';
  
  /** Temporal context (if query references time) */
  temporalContext?: {
    referenceTime: Date;
    timeRange?: {
      start: Date;
      end: Date;
    };
  };
}

/**
 * Database schema extensions for Bayesian memory management
 */
export interface BayesianMessageMetadata {
  messageId: number;
  chatId: string;
  
  /** Bayesian-specific metadata */
  timesReferenced: number;
  lastReferencedAt?: Date;
  averageRelevanceScore: number;
  
  /** Entity and topic extraction results */
  extractedEntities: string[];
  extractedTopics: string[];
  
  /** Semantic fingerprint for quick comparison */
  semanticFingerprint: string;
  
  /** Conversation context position */
  conversationPosition: number; // 0-1, where 0 is start, 1 is most recent
  
  /** User interaction patterns */
  userInteractionPattern: {
    directlyReferenced: number;
    indirectlyReferenced: number;
    followUpQuestions: number;
  };
}

export interface BayesianContextWindow {
  /** Messages selected by Bayesian analysis */
  bayesianSelectedMessages: Array<{
    message: HistoricalMessage;
    relevanceProbability: number;
    evidenceBreakdown: BayesianEvidence;
    contextNote: string;
  }>;
  
  /** Always included recent messages */
  recentMessages: HistoricalMessage[];
  
  /** Compressed summaries of excluded segments */
  summaries: Array<{
    segmentId: number;
    summary: string;
    messageCount: number;
    timeRange: {
      start: Date;
      end: Date;
    };
  }>;
  
  /** Key facts extracted from conversation */
  keyFacts: Array<{
    fact: string;
    confidence: number;
    sourceMessageIds: number[];
  }>;
  
  /** Total context statistics */
  statistics: {
    totalTokens: number;
    compressionRatio: number;
    bayesianSelectionRatio: number; // % of context from Bayesian selection
    averageRelevanceProbability: number;
  };
  
  /** Context note for LLM explaining the selection */
  contextExplanation: string;
}
