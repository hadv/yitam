import fs from 'fs/promises';
import path from 'path';

export interface LegalDocument {
  content: string;
  lastUpdated: string;
  version: string;
}

export class LegalService {
  private static instance: LegalService;
  private documentsCache: Map<string, LegalDocument> = new Map();
  private readonly documentsPath: string;

  private constructor() {
    // Resolve path from project root
    this.documentsPath = path.resolve(process.cwd(), 'src/data/legal');
  }

  public static getInstance(): LegalService {
    if (!LegalService.instance) {
      LegalService.instance = new LegalService();
    }
    return LegalService.instance;
  }

  /**
   * Get legal document content
   * @param documentType 'terms' | 'privacy'
   * @returns Promise<LegalDocument>
   */
  public async getDocument(documentType: 'terms' | 'privacy'): Promise<LegalDocument> {
    const cachedDoc = this.documentsCache.get(documentType);
    if (cachedDoc) {
      return cachedDoc;
    }

    try {
      const fileName = documentType === 'terms' ? 'terms-and-conditions.md' : 'privacy-policy.md';
      const filePath = path.join(this.documentsPath, fileName);
      
      console.log('Attempting to read file from:', filePath); // Debug log
      
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Extract the last updated date from the content
      const lastUpdated = this.extractLastUpdated(content);
      
      const document: LegalDocument = {
        content,
        lastUpdated,
        version: '1.0', // You can implement version control if needed
      };

      this.documentsCache.set(documentType, document);
      return document;
    } catch (error: any) {
      console.error(`Error loading ${documentType} document:`, error);
      throw new Error(`Failed to load ${documentType} document: ${error.message}`);
    }
  }

  /**
   * Extract last updated date from document content
   */
  private extractLastUpdated(content: string): string {
    const match = content.match(/Last Updated: \[(.*?)\]/);
    if (match && match[1]) {
      return match[1] === 'Current Date' ? new Date().toISOString().split('T')[0] : match[1];
    }
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Clear the documents cache
   */
  public clearCache(): void {
    this.documentsCache.clear();
  }
} 