import { MessageParam as AnthropicMessageParam, ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Persona, getDefaultPersona, getPersonaById } from '../constants/Personas';
import { ContextEngine, ContextWindow, MessageParam as ContextMessageParam } from './ContextEngine';
import { VectorStoreManager, VectorStoreConfig } from './VectorStore';

export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string | ContentBlockParam[];
  timestamp: Date;
  importance?: number;
  tokens?: number;
}

export interface ConversationConfig {
  enableContextEngine: boolean;
  maxContextTokens: number;
  compressionThreshold: number;
  vectorStoreConfig?: VectorStoreConfig;
}

/**
 * Enhanced conversation service with context engine integration
 */
export class EnhancedConversation {
  private conversationHistory: ContextMessageParam[] = [];
  private messageHistory: ConversationMessage[] = [];
  private chatId: string = '';
  private currentPersona: Persona = getDefaultPersona();
  private contextEngine?: ContextEngine;
  private vectorStore?: VectorStoreManager;
  private config: ConversationConfig;
  private messageIdCounter: number = 1;

  constructor(config?: Partial<ConversationConfig>) {
    this.config = {
      enableContextEngine: true,
      maxContextTokens: 8000,
      compressionThreshold: 20,
      ...config
    };

    if (this.config.enableContextEngine) {
      this.initializeContextEngine();
    }
  }

  private async initializeContextEngine(): Promise<void> {
    try {
      // Initialize context engine
      this.contextEngine = new ContextEngine({
        maxContextTokens: this.config.maxContextTokens,
        summarizationThreshold: this.config.compressionThreshold
      });
      await this.contextEngine.initialize();

      // Initialize vector store if config provided
      if (this.config.vectorStoreConfig) {
        this.vectorStore = new VectorStoreManager(this.config.vectorStoreConfig);
        await this.vectorStore.initialize();
      }

      console.log('Context engine initialized for enhanced conversation');
    } catch (error) {
      console.error('Failed to initialize context engine:', error);
      this.config.enableContextEngine = false;
    }
  }

  /**
   * Starts a new conversation and returns the new chat ID
   */
  async startNewChat(personaId?: string): Promise<string> {
    this.conversationHistory = [];
    this.messageHistory = [];
    this.messageIdCounter = 1;
    this.chatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Set persona if provided, otherwise use default
    if (personaId) {
      this.setPersona(personaId);
    } else {
      this.currentPersona = getDefaultPersona();
    }

    // Initialize conversation in context engine
    if (this.contextEngine) {
      await this.contextEngine.createConversation(this.chatId, undefined, `Chat with ${this.currentPersona.displayName}`);
    }
    
    console.log(`Starting new enhanced chat with ID: ${this.chatId} using persona: ${this.currentPersona.displayName}`);
    return this.chatId;
  }

  /**
   * Adds a message to an existing conversation
   */
  async addToExistingChat(chatId: string, message: ContextMessageParam): Promise<boolean> {
    if (this.chatId !== chatId) {
      console.error(`Chat ID mismatch: ${chatId} vs ${this.chatId}`);
      return false;
    }
    
    await this.addMessage(message);
    return true;
  }

  /**
   * Returns the current chat ID
   */
  getCurrentChatId(): string {
    return this.chatId;
  }

  /**
   * Returns the current persona
   */
  getCurrentPersona(): Persona {
    return this.currentPersona;
  }

  /**
   * Sets the current persona by ID
   */
  setPersona(personaId: string): void {
    const newPersona = getPersonaById(personaId);
    this.currentPersona = newPersona;
    console.log(`Set persona to ${newPersona.displayName} for chat ${this.chatId}`);
  }

  /**
   * Returns optimized conversation history using context engine
   */
  async getConversationHistory(currentQuery?: string): Promise<AnthropicMessageParam[]> {
    if (!this.config.enableContextEngine || !this.contextEngine) {
      // Fallback to traditional full history - convert to Anthropic format
      return this.convertToAnthropicMessages(this.conversationHistory);
    }

    try {
      // Get optimized context from context engine
      const contextWindow = await this.contextEngine.getOptimizedContext(this.chatId, currentQuery);
      
      // Convert context window back to ContextMessageParam format
      const optimizedHistory = this.buildOptimizedHistory(contextWindow);
      
      console.log(`Context engine provided ${optimizedHistory.length} messages (${contextWindow.totalTokens} tokens, ${(contextWindow.compressionRatio * 100).toFixed(1)}% compression)`);
      
      return optimizedHistory;
    } catch (error) {
      console.error('Error getting optimized context, falling back to full history:', error);
      return this.convertToAnthropicMessages(this.conversationHistory);
    }
  }

  /**
   * Clears the current conversation history
   */
  clearConversationHistory(): void {
    this.conversationHistory = [];
    this.messageHistory = [];
    this.messageIdCounter = 1;
    console.log(`Cleared conversation history for chat ${this.chatId}`);
  }

  /**
   * Adds a user message to the conversation
   */
  async addUserMessage(query: string, importance?: number): Promise<void> {
    const message: ContextMessageParam = {
      role: "user",
      content: query,
    };
    
    await this.addMessage(message, importance);
  }

  /**
   * Adds an assistant message to the conversation
   */
  async addAssistantMessage(content: string | ContentBlockParam[], importance?: number): Promise<void> {
    // If content is a string and not using default persona, replace "Yitam" with persona name
    let processedContent = content;
    if (typeof content === 'string' && this.currentPersona.id !== 'yitam') {
      // Replace "Yitam" or "Yitam:" at the beginning of responses
      processedContent = content.replace(
        /^(Yitam:?\s+|Yitam\s+)/g, 
        `${this.currentPersona.displayName}: `
      );
    }

    const message: ContextMessageParam = {
      role: "assistant",
      content: processedContent,
    };
    
    await this.addMessage(message, importance);
  }

  /**
   * Adds a tool use message to the conversation
   */
  async addToolUseMessage(toolId: string, toolName: string, toolInput: any): Promise<void> {
    const message: ContextMessageParam = {
      role: "assistant",
      content: [{ type: "tool_use", id: toolId, name: toolName, input: toolInput }],
    };
    
    await this.addMessage(message);
  }

  /**
   * Adds a tool result message to the conversation
   */
  async addToolResultMessage(toolUseId: string, content: any): Promise<void> {
    const message: ContextMessageParam = {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: typeof content === 'object' 
            ? JSON.stringify(content, null, 2)
            : String(content),
        },
      ],
    };
    
    await this.addMessage(message);
  }

  /**
   * Mark a specific message as important
   */
  async markMessageImportant(messageId: number, important: boolean = true): Promise<void> {
    if (this.contextEngine) {
      await this.contextEngine.markMessageImportant(messageId, important);
    }
    
    // Update local message history
    const message = this.messageHistory.find(m => m.id === messageId);
    if (message) {
      message.importance = important ? Math.max(message.importance || 0.5, 0.8) : (message.importance || 0.5) * 0.5;
    }
  }

  /**
   * Add a key fact to the conversation memory
   */
  async addKeyFact(factText: string, factType: 'decision' | 'preference' | 'fact' | 'goal' = 'fact', sourceMessageId?: number): Promise<void> {
    if (this.contextEngine) {
      await this.contextEngine.addKeyFact(this.chatId, factText, factType, sourceMessageId);
    }
  }

  /**
   * Search for relevant messages in the conversation
   */
  async searchRelevantMessages(query: string, limit: number = 5): Promise<any[]> {
    if (this.vectorStore) {
      return await this.vectorStore.findRelevantMessages(query, limit);
    }
    return [];
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(): Promise<any> {
    if (this.contextEngine) {
      return await this.contextEngine.getConversationStats(this.chatId);
    }
    
    return {
      totalMessages: this.messageHistory.length,
      totalTokens: this.messageHistory.reduce((sum, msg) => sum + (msg.tokens || 0), 0),
      segmentCount: 0,
      factCount: 0,
      avgCompression: 1.0
    };
  }

  // Private helper methods

  private async addMessage(message: ContextMessageParam, importance?: number): Promise<void> {
    // Add to traditional history
    this.conversationHistory.push(message);
    
    // Create enhanced message record
    const enhancedMessage: ConversationMessage = {
      id: this.messageIdCounter++,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp: new Date(),
      importance: importance || this.calculateImportance(message),
      tokens: this.estimateTokens(message.content)
    };
    
    this.messageHistory.push(enhancedMessage);

    // Add to context engine
    if (this.contextEngine) {
      await this.contextEngine.addMessage(this.chatId, enhancedMessage.id, message, enhancedMessage.importance);
    }

    // Add to vector store
    if (this.vectorStore) {
      await this.vectorStore.addMessage(enhancedMessage.id, message);
    }
  }

  private calculateImportance(message: ContextMessageParam): number {
    let score = 0.5; // Base score
    
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    
    // Boost for questions
    if (content.includes('?')) score += 0.1;
    
    // Boost for decisions/commitments
    if (/\b(decide|commit|agree|promise|will do|let's)\b/i.test(content)) score += 0.2;
    
    // Boost for important keywords
    if (/\b(important|critical|urgent|remember|note)\b/i.test(content)) score += 0.15;
    
    // Boost for user role
    if (message.role === 'user') score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private estimateTokens(content: string | ContentBlockParam[]): number {
    if (typeof content === 'string') {
      return Math.ceil(content.length / 4);
    }
    return Math.ceil(JSON.stringify(content).length / 4);
  }

  private convertToAnthropicMessages(messages: ContextMessageParam[]): AnthropicMessageParam[] {
    return messages
      .filter(msg => msg.role !== 'system') // Filter out system messages as Anthropic doesn't support them
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));
  }

  private buildOptimizedHistory(contextWindow: ContextWindow): AnthropicMessageParam[] {
    const optimizedHistory: AnthropicMessageParam[] = [];

    // Convert and add recent messages (full detail)
    optimizedHistory.push(...this.convertToAnthropicMessages(contextWindow.recentMessages));

    // Convert and add relevant history
    optimizedHistory.push(...this.convertToAnthropicMessages(contextWindow.relevantHistory));
    
    // Add summaries as system messages
    for (const summary of contextWindow.summaries) {
      if (summary.summary) {
        optimizedHistory.unshift({
          role: 'assistant',
          content: `[Summary of messages ${summary.startMessageId}-${summary.endMessageId}]: ${summary.summary}`
        });
      }
    }
    
    // Add key facts as system context
    if (contextWindow.keyFacts.length > 0) {
      const factsContent = contextWindow.keyFacts
        .map(fact => `${fact.factType.toUpperCase()}: ${fact.factText}`)
        .join('\n');
      
      optimizedHistory.unshift({
        role: 'assistant',
        content: `[Key Facts]: \n${factsContent}`
      });
    }
    
    return optimizedHistory;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
  }
}
