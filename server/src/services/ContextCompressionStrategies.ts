import { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

export interface CompressionResult {
  compressedContent: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  strategy: string;
}

export interface CompressionStrategy {
  name: string;
  compress(messages: MessageParam[], targetRatio: number): Promise<CompressionResult>;
}

/**
 * Extractive summarization - extracts key sentences
 */
export class ExtractiveSummarizationStrategy implements CompressionStrategy {
  name = 'extractive';

  async compress(messages: MessageParam[], targetRatio: number): Promise<CompressionResult> {
    const fullText = this.messagesToText(messages);
    const originalTokens = this.estimateTokens(fullText);
    
    // Split into sentences
    const sentences = this.splitIntoSentences(fullText);
    
    // Score sentences by importance
    const scoredSentences = this.scoreSentences(sentences);
    
    // Select top sentences to meet target ratio
    const targetTokens = Math.floor(originalTokens * targetRatio);
    const selectedSentences = this.selectSentencesByTokens(scoredSentences, targetTokens);
    
    const compressedContent = selectedSentences.join(' ');
    const compressedTokens = this.estimateTokens(compressedContent);
    
    return {
      compressedContent,
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      strategy: this.name
    };
  }

  private messagesToText(messages: MessageParam[]): string {
    return messages.map(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return `${msg.role}: ${content}`;
    }).join('\n');
  }

  private splitIntoSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  }

  private scoreSentences(sentences: string[]): Array<{sentence: string, score: number}> {
    return sentences.map(sentence => ({
      sentence: sentence.trim(),
      score: this.calculateSentenceScore(sentence)
    })).sort((a, b) => b.score - a.score);
  }

  private calculateSentenceScore(sentence: string): number {
    let score = 0;
    
    // Length bonus (not too short, not too long)
    const words = sentence.split(' ').length;
    if (words >= 5 && words <= 25) score += 0.3;
    
    // Important keywords
    const importantWords = ['important', 'key', 'main', 'primary', 'essential', 'critical', 'remember', 'note'];
    importantWords.forEach(word => {
      if (sentence.toLowerCase().includes(word)) score += 0.2;
    });
    
    // Question bonus
    if (sentence.includes('?')) score += 0.1;
    
    // Numbers and specifics
    if (/\d/.test(sentence)) score += 0.1;
    
    // Proper nouns (capitalized words)
    const properNouns = sentence.match(/\b[A-Z][a-z]+\b/g);
    if (properNouns && properNouns.length > 0) score += 0.1;
    
    return score;
  }

  private selectSentencesByTokens(scoredSentences: Array<{sentence: string, score: number}>, targetTokens: number): string[] {
    const selected: string[] = [];
    let currentTokens = 0;
    
    for (const item of scoredSentences) {
      const sentenceTokens = this.estimateTokens(item.sentence);
      if (currentTokens + sentenceTokens <= targetTokens) {
        selected.push(item.sentence);
        currentTokens += sentenceTokens;
      }
    }
    
    return selected;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Abstractive summarization using key points
 */
export class AbstractiveSummarizationStrategy implements CompressionStrategy {
  name = 'abstractive';

  async compress(messages: MessageParam[], targetRatio: number): Promise<CompressionResult> {
    const fullText = this.messagesToText(messages);
    const originalTokens = this.estimateTokens(fullText);
    
    // Extract key topics and entities
    const keyPoints = this.extractKeyPoints(messages);
    const entities = this.extractEntities(fullText);
    const decisions = this.extractDecisions(fullText);
    
    // Generate summary
    const summary = this.generateSummary(keyPoints, entities, decisions);
    const compressedTokens = this.estimateTokens(summary);
    
    return {
      compressedContent: summary,
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      strategy: this.name
    };
  }

  private messagesToText(messages: MessageParam[]): string {
    return messages.map(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return `${msg.role}: ${content}`;
    }).join('\n');
  }

  private extractKeyPoints(messages: MessageParam[]): string[] {
    const keyPoints: string[] = [];
    
    messages.forEach(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      
      // Look for explicit key points
      const keyPointPatterns = [
        /(?:key|main|important) (?:point|idea|concept|thing)/gi,
        /(?:remember|note) that/gi,
        /(?:decision|conclusion|agreement)/gi
      ];
      
      keyPointPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          // Extract sentence containing the match
          const sentences = content.split(/[.!?]+/);
          sentences.forEach(sentence => {
            if (pattern.test(sentence) && sentence.trim().length > 20) {
              keyPoints.push(sentence.trim());
            }
          });
        }
      });
    });
    
    return [...new Set(keyPoints)]; // Remove duplicates
  }

  private extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    // Extract proper nouns (simple approach)
    const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (properNouns) {
      entities.push(...properNouns);
    }
    
    // Extract numbers and dates
    const numbers = text.match(/\b\d+(?:[.,]\d+)*\b/g);
    if (numbers) {
      entities.push(...numbers);
    }
    
    return [...new Set(entities)];
  }

  private extractDecisions(text: string): string[] {
    const decisions: string[] = [];
    
    const decisionPatterns = [
      /(?:decided|agreed|concluded|determined) (?:to|that|on)/gi,
      /(?:will|going to|plan to|intend to)/gi,
      /(?:should|must|need to|have to)/gi
    ];
    
    decisionPatterns.forEach(pattern => {
      const sentences = text.split(/[.!?]+/);
      sentences.forEach(sentence => {
        if (pattern.test(sentence) && sentence.trim().length > 15) {
          decisions.push(sentence.trim());
        }
      });
    });
    
    return [...new Set(decisions)];
  }

  private generateSummary(keyPoints: string[], entities: string[], decisions: string[]): string {
    const summaryParts: string[] = [];
    
    if (keyPoints.length > 0) {
      summaryParts.push(`Key points discussed: ${keyPoints.slice(0, 3).join('; ')}`);
    }
    
    if (entities.length > 0) {
      summaryParts.push(`Important entities: ${entities.slice(0, 5).join(', ')}`);
    }
    
    if (decisions.length > 0) {
      summaryParts.push(`Decisions made: ${decisions.slice(0, 2).join('; ')}`);
    }
    
    return summaryParts.join('. ') + '.';
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Hierarchical compression - different strategies for different message types
 */
export class HierarchicalCompressionStrategy implements CompressionStrategy {
  name = 'hierarchical';
  
  private extractiveStrategy = new ExtractiveSummarizationStrategy();
  private abstractiveStrategy = new AbstractiveSummarizationStrategy();

  async compress(messages: MessageParam[], targetRatio: number): Promise<CompressionResult> {
    // Categorize messages
    const categorized = this.categorizeMessages(messages);
    
    // Apply different compression strategies
    const results: CompressionResult[] = [];
    
    // High importance - light compression
    if (categorized.high.length > 0) {
      const result = await this.extractiveStrategy.compress(categorized.high, 0.8);
      results.push(result);
    }
    
    // Medium importance - moderate compression
    if (categorized.medium.length > 0) {
      const result = await this.extractiveStrategy.compress(categorized.medium, 0.5);
      results.push(result);
    }
    
    // Low importance - heavy compression
    if (categorized.low.length > 0) {
      const result = await this.abstractiveStrategy.compress(categorized.low, 0.2);
      results.push(result);
    }
    
    // Combine results
    const compressedContent = results.map(r => r.compressedContent).join('\n\n');
    const originalTokens = results.reduce((sum, r) => sum + r.originalTokens, 0);
    const compressedTokens = this.estimateTokens(compressedContent);
    
    return {
      compressedContent,
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      strategy: this.name
    };
  }

  private categorizeMessages(messages: MessageParam[]): {
    high: MessageParam[],
    medium: MessageParam[],
    low: MessageParam[]
  } {
    const high: MessageParam[] = [];
    const medium: MessageParam[] = [];
    const low: MessageParam[] = [];
    
    messages.forEach(msg => {
      const importance = this.calculateMessageImportance(msg);
      
      if (importance > 0.7) {
        high.push(msg);
      } else if (importance > 0.4) {
        medium.push(msg);
      } else {
        low.push(msg);
      }
    });
    
    return { high, medium, low };
  }

  private calculateMessageImportance(message: MessageParam): number {
    let score = 0.5; // Base score
    
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    
    // User messages are generally more important
    if (message.role === 'user') score += 0.2;
    
    // Questions are important
    if (content.includes('?')) score += 0.1;
    
    // Important keywords
    const importantKeywords = ['important', 'critical', 'urgent', 'remember', 'decision', 'agree', 'commit'];
    importantKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword)) score += 0.1;
    });
    
    // Length consideration (very short or very long messages might be less important)
    const wordCount = content.split(' ').length;
    if (wordCount < 5 || wordCount > 100) score -= 0.1;
    
    // Tool use messages
    if (Array.isArray(message.content) && message.content.some(block => block.type === 'tool_use')) {
      score += 0.15;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Context compression manager
 */
export class ContextCompressionManager {
  private strategies: Map<string, CompressionStrategy> = new Map();

  constructor() {
    this.registerStrategy(new ExtractiveSummarizationStrategy());
    this.registerStrategy(new AbstractiveSummarizationStrategy());
    this.registerStrategy(new HierarchicalCompressionStrategy());
  }

  registerStrategy(strategy: CompressionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  async compress(
    messages: MessageParam[], 
    targetRatio: number, 
    strategyName: string = 'hierarchical'
  ): Promise<CompressionResult> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown compression strategy: ${strategyName}`);
    }

    return await strategy.compress(messages, targetRatio);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  async compareStrategies(messages: MessageParam[], targetRatio: number): Promise<CompressionResult[]> {
    const results: CompressionResult[] = [];
    
    for (const [name, strategy] of this.strategies) {
      try {
        const result = await strategy.compress(messages, targetRatio);
        results.push(result);
      } catch (error) {
        console.error(`Error with strategy ${name}:`, error);
      }
    }
    
    return results.sort((a, b) => a.compressionRatio - b.compressionRatio);
  }
}
