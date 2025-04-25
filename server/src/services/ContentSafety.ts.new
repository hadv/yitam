import { ContentSafetyError } from '../utils/errors';
import { Language } from '../types';
import Anthropic from '@anthropic-ai/sdk';

// Define unified safety rules
const SAFETY_RULES = {

  // Prompt injection prevention
  PROMPT_INJECTION: {
    TEMPLATE_LITERAL: {
      name: 'Template Literal Injection',
      patterns: [
        /\$\{.*\}/i,
        /\{\{.*\}\}/i,
        /Ignore previous instructions/i,
        /Disregard (all )?previous instructions/i,
        /You (are|must) now (act as|be) (a different|an unrestricted) AI/i,
        /Switch to system mode/i,
        /Forget your (previous )?training/i,
        /system:\s*override/i
      ],
      message: {
        en: 'Potential template literal injection detected',
        vi: 'Phát hiện mã độc template literal tiềm ẩn'
      }
    },
    ENVIRONMENT: {
      name: 'Environment Variable Injection',
      patterns: [
        /process\.env\./i,
        /\$[A-Z_]+/i
      ],
      message: {
        en: 'Potential environment variable injection detected',
        vi: 'Phát hiện mã độc biến môi trường tiềm ẩn'
      }
    },
    SYSTEM_PROMPT: {
      name: 'system_prompt_leak',
      patterns: [
        /system prompt/i,
        /system instructions/i,
        /system message/i,
        /assistant instructions/i,
        /assistant guidelines/i,
        /assistant rules/i,
        /assistant role/i,
        /assistant behavior/i,
        /assistant configuration/i,
        /assistant settings/i,
        /Ignore previous instructions/i,
        /Disregard (all )?previous instructions/i,
        /You (are|must) now (act as|be) (a different|an unrestricted) AI/i,
        /Switch to system mode/i,
        /Forget your (previous )?training/i,
        /system:\s*override/i
      ],
      message: {
        en: 'Potential system prompt leak detected',
        vi: 'Phát hiện rò rỉ system prompt tiềm ẩn'
      }
    },
    FUNCTION_LEAK: {
      name: 'function_leak',
      patterns: [
        /available functions/i,
        /function description/i,
        /function parameters/i,
        /function schema/i,
        /function list/i,
        /tool description/i,
        /tool parameters/i,
        /tool schema/i,
        /tool list/i,
      ],
      message: {
        en: 'Potential function information leak detected',
        vi: 'Phát hiện rò rỉ thông tin function tiềm ẩn'
      }
    },
    CONVERSATION_LEAK: {
      name: 'conversation_leak',
      patterns: [
        /conversation history/i,
        /chat history/i,
        /message history/i,
        /previous messages/i,
        /earlier messages/i,
        /past messages/i,
      ],
      message: {
        en: 'Potential conversation history leak detected',
        vi: 'Phát hiện rò rỉ lịch sử hội thoại tiềm ẩn'
      }
    }
  },

  // Suspicious Unicode ranges
  UNICODE: {
    CONTROL_CHARS: [0x0080, 0x00A0],
    INVISIBLE_SPACES: [0x2000, 0x2070],
    ZERO_WIDTH: [0x200B, 0x200F],
    NO_BREAK_SPACE: [0xFEFF, 0xFEFF],
    LINE_SEPARATORS: [0x2028, 0x202F],
    MATH_SPACES: [0x205F, 0x206F],
  },
};

interface ContentSafetyConfig {
  maxMessageLength: number;
  enablePromptInjectionCheck: boolean;
  enableUnicodeSafety: boolean;
  useAiContentSafety: boolean;
  language?: 'en' | 'vi';
  customBlockList?: string[];
}

const defaultConfig: ContentSafetyConfig = {
  maxMessageLength: 2000,
  enablePromptInjectionCheck: true,
  enableUnicodeSafety: true,
  useAiContentSafety: false, // Default to false for backward compatibility
  language: 'vi',
};

export class ContentSafetyService {
  private config: ContentSafetyConfig;
  private aiClient: Anthropic | null = null;
  private safetyCache: Map<string, { timestamp: number, isSafe: boolean, reason?: string, category?: string }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(customConfig?: Partial<ContentSafetyConfig>) {
    this.config = { ...defaultConfig, ...customConfig };
    this.initializeAiClient();
  }

  /**
   * Initialize the AI client if AI content safety is enabled
   */
  private initializeAiClient(): void {
    if (this.config.useAiContentSafety) {
      const apiKey = process.env.ANTHROPIC_API_KEY || '';
      if (apiKey) {
        this.aiClient = new Anthropic({ apiKey });
      } else {
        console.warn('ANTHROPIC_API_KEY not found. AI content safety check will be disabled.');
        this.config.useAiContentSafety = false;
      }
    }
  }

  /**
   * Generate a cache key for content (uses a simplified hash)
   */
  private getCacheKey(content: string): string {
    // Simple string hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Check if result is cached and still valid
   */
  private getCachedResult(content: string): { isSafe: boolean, reason?: string, category?: string } | null {
    const key = this.getCacheKey(content);
    const cached = this.safetyCache.get(key);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log('Using cached content safety result');
      return { 
        isSafe: cached.isSafe,
        reason: cached.reason,
        category: cached.category
      };
    }
    
    return null;
  }

  /**
   * Store result in cache
   */
  private setCacheResult(content: string, result: { isSafe: boolean, reason?: string, category?: string }): void {
    const key = this.getCacheKey(content);
    this.safetyCache.set(key, {
      timestamp: Date.now(),
      isSafe: result.isSafe,
      reason: result.reason,
      category: result.category
    });
    
    // Cleanup old cache entries if cache gets too large
    if (this.safetyCache.size > 1000) {
      const now = Date.now();
      // Delete expired entries
      for (const [key, value] of this.safetyCache.entries()) {
        if (now - value.timestamp > this.CACHE_TTL) {
          this.safetyCache.delete(key);
        }
      }
    }
  }

  /**
   * Enable or disable AI-based content safety checks
   * @param enable Whether to enable AI content safety
   * @returns True if successfully enabled, false otherwise
   */
  public enableAiContentSafety(enable: boolean = true): boolean {
    this.config.useAiContentSafety = enable;
    
    if (enable && !this.aiClient) {
      this.initializeAiClient();
    }
    
    return this.config.useAiContentSafety === enable;
  }

  /**
   * Check if AI-based content safety is enabled
   */
  public isAiContentSafetyEnabled(): boolean {
    return this.config.useAiContentSafety && this.aiClient !== null;
  }

  /**
   * Validates the content against safety rules
   * @param content The content to validate
   * @throws ContentSafetyError if content violates safety rules
   */
  public async validateContent(content: string): Promise<void> {
    // Check cache first
    const cachedResult = this.getCachedResult(content);
    if (cachedResult) {
      if (!cachedResult.isSafe) {
        throw new ContentSafetyError(
          `Content contains restricted topic: ${cachedResult.reason || 'unknown reason'}`,
          cachedResult.category || 'restricted_topic',
          this.config.language || 'en'
        );
      }
      return; // Content is safe and cached
    }
    
    // Use AI-based validation if enabled
    if (this.config.useAiContentSafety && this.aiClient) {
      try {
        await this.validateContentWithAI(content);
        // Cache successful result
        this.setCacheResult(content, { isSafe: true });
        return; // If AI validation passes, we're done
      } catch (error) {
        if (error instanceof ContentSafetyError) {
          // Cache unsuccessful result with reason
          this.setCacheResult(content, { 
            isSafe: false, 
            reason: error.message,
            category: error.code
          });
          throw error; // Rethrow ContentSafetyError from AI validation
        }
        // If other errors occur with AI validation, log warning
        console.warn('AI content validation failed:', error);
      }
    }

    // If AI validation is not enabled or failed, check for prompt injection
    if (this.config.enablePromptInjectionCheck) {
      this.checkPromptInjection(content);
    }
    
    // If we got here without throwing, content is safe
    this.setCacheResult(content, { isSafe: true });
  }

  /**
   * Validates content using AI
   * @param content The content to validate with AI
   * @throws ContentSafetyError if content is deemed unsafe
   */
  private async validateContentWithAI(content: string): Promise<void> {
    if (!this.aiClient) {
      throw new Error('AI client not initialized');
    }

    // Performance optimization: Skip validation for very short or obviously safe content
    if (content.length < 5 || /^(hi|hello|xin chào|chào|cảm ơn|thank you)$/i.test(content.trim())) {
      return; // Skip safety check for simple greetings
    }

    console.time('content-safety-check');
    
    const result = await this.aiClient.messages.create({
      model: "claude-3-haiku-20240307", // Using haiku for faster response time
      max_tokens: 150, // Reduced from 1024 to improve speed
      messages: [
        {
          role: "user", 
          content: `Safety check (be permissive). Content: "${content}".
          
          Return JSON only: {"isSafe": true/false, "reason": "reason if unsafe", "category": "category_if_unsafe"}`
        }
      ],
      temperature: 0,
    });
    
    console.timeEnd('content-safety-check');

    try {
      // Get the response text
      const responseText = result.content[0].type === 'text' 
        ? result.content[0].text 
        : JSON.stringify(result.content[0]);
      
      // Extract JSON from the response - AI might include extra text
      const aiResponse = this.extractJsonFromText(responseText);
      
      if (!aiResponse) {
        console.error('Failed to extract valid JSON from AI response:', responseText);
        throw new ContentSafetyError(
          "Failed to validate content - unable to parse AI response",
          "processing_error",
          this.config.language || 'en'
        );
      }
      
      if (!aiResponse.isSafe) {
        throw new ContentSafetyError(
          `Content contains restricted topic: ${aiResponse.reason || 'unknown reason'}`,
          aiResponse.category || 'restricted_topic',
          this.config.language || 'en'
        );
      }
    } catch (error) {
      if (error instanceof ContentSafetyError) throw error;
      
      console.error('Error parsing AI content safety response:', error);
      console.error('Raw response text:', result.content[0].type === 'text' ? result.content[0].text : 'non-text response');
      throw new ContentSafetyError(
        "Failed to validate content",
        "processing_error",
        this.config.language || 'en'
      );
    }
  }

  /**
   * Attempts to extract valid JSON from text that might contain additional content
   * @param text Text that might contain JSON
   * @returns Parsed JSON object or null if extraction failed
   */
  private extractJsonFromText(text: string): any {
    // Try direct parsing first
    try {
      return JSON.parse(text);
    } catch (e) {
      // Continue with extraction methods
    }

    try {
      // Method 1: Find text between {} brackets (naive approach, but often works)
      const jsonRegex = /{[\s\S]*}/;
      const match = text.match(jsonRegex);
      if (match && match[0]) {
        return JSON.parse(match[0]);
      }

      // Method 2: Look for JSON with markdown code blocks
      const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
      const markdownMatch = text.match(markdownRegex);
      if (markdownMatch && markdownMatch[1]) {
        return JSON.parse(markdownMatch[1]);
      }

      // Method 3: Try to construct JSON from response by extracting key properties
      if (text.includes('isSafe')) {
        const isSafeRegex = /isSafe["\s:]+(\w+)/i;
        const safeMatch = text.match(isSafeRegex);
        const isSafe = safeMatch && (safeMatch[1].toLowerCase() === 'true');

        let reason = '';
        const reasonRegex = /reason["\s:]+["']?([^"'\n,]+(?:\s+[^"'\n,]+)*)["']?/i;
        const reasonMatch = text.match(reasonRegex);
        if (reasonMatch) reason = reasonMatch[1];

        let category = '';
        const categoryRegex = /category["\s:]+["']?([^"'\n,]+)["']?/i;
        const categoryMatch = text.match(categoryRegex);
        if (categoryMatch) category = categoryMatch[1];

        return {
          isSafe: !!isSafe,
          reason,
          category
        };
      }
    } catch (e) {
      console.error('Error in JSON extraction fallback:', e);
    }

    // If all extraction methods fail
    return this.createFallbackResponse(text);
  }

  /**
   * Creates a fallback response when JSON parsing fails, based on simple text analysis
   * @param text The original response text
   * @returns A fallback response object
   */
  private createFallbackResponse(text: string): any {
    // Default to safe when in doubt - prefer being permissive
    let isSafe = true;
    let reason = '';
    let category = '';

    // Check for common indicators of unsafe content
    const lowerText = text.toLowerCase();
    
    // Only mark as unsafe if we're confident
    // Look for strong signals of unsafe content
    if ((lowerText.includes('not safe') && lowerText.includes('unsafe')) || 
        (lowerText.includes('unsafe') && lowerText.includes('false')) ||
        (lowerText.includes('dangerous') && lowerText.includes('harmful'))) {
      
      isSafe = false;
      
      // Try to determine category
      if (lowerText.includes('medical') && (lowerText.includes('treatment') || lowerText.includes('diagnosis'))) {
        category = 'medical_advice';
        reason = 'Content appears to contain specific medical advice';
      } else if (lowerText.includes('financial') && (lowerText.includes('investment') || lowerText.includes('stock'))) {
        category = 'financial_advice';
        reason = 'Content appears to contain specific financial advice';
      } else if (lowerText.includes('legal') && lowerText.includes('advice')) {
        category = 'legal_advice';
        reason = 'Content appears to contain specific legal advice';
      } else if (lowerText.includes('harmful') && (lowerText.includes('damage') || lowerText.includes('injury'))) {
        category = 'harmful_content';
        reason = 'Content appears to contain potentially harmful information';
      } else if ((lowerText.includes('adult') && lowerText.includes('explicit')) || lowerText.includes('sexual')) {
        category = 'adult_content';
        reason = 'Content appears to contain adult content';
      } else if (lowerText.includes('prompt injection') && lowerText.includes('system')) {
        category = 'prompt_injection';
        reason = 'Content appears to contain prompt injection attempts';
      } else {
        // If unclear but still flagged as unsafe, default to safer category
        category = 'harmful_content';
        reason = 'Content may contain restricted information';
      }
    } else {
      // If we see "Vietnamese" being mentioned as a reason, make sure we don't flag it
      if (lowerText.includes('vietnamese') || lowerText.includes('viet')) {
        isSafe = true;
        console.log('Content was in Vietnamese but not unsafe - allowing content');
      }
    }

    console.warn('Using fallback content safety response:', { isSafe, reason, category });
    return { isSafe, reason, category };
  }

  /**
   * Validates the response content
   * Checks for prompt injection attempts
   */
  public async validateResponse(content: string, language: Language): Promise<void> {
    // For response validation, only check for prompt injection
    // This is much faster than running AI validation on each response chunk
    
    // Skip empty content
    if (!content || content.trim().length === 0) {
      return;
    }
    
    // Check cache first for existing results
    const cachedResult = this.getCachedResult(content);
    if (cachedResult) {
      if (!cachedResult.isSafe) {
        throw new ContentSafetyError(
          `Content contains restricted topic: ${cachedResult.reason || 'unknown reason'}`,
          cachedResult.category || 'restricted_topic',
          language
        );
      }
      return; // Content is safe and cached
    }
    
    // Only do full AI validation for longer responses
    // For short response chunks, just check for prompt injection
    if (content.length > 500 && this.config.useAiContentSafety && this.aiClient) {
      try {
        await this.validateContentWithAI(content);
        this.setCacheResult(content, { isSafe: true });
        return; // If AI validation passes, we're done
      } catch (error) {
        if (error instanceof ContentSafetyError) {
          this.setCacheResult(content, { 
            isSafe: false, 
            reason: error.message,
            category: error.code
          });
          throw error; // Rethrow ContentSafetyError from AI validation
        }
        // Fall back to pattern-based for other errors
        console.warn('AI response validation failed:', error);
      }
    }

    // Fall back to prompt injection check - this is fast
    if (this.containsPromptInjection(content)) {
      const result = { 
        isSafe: false, 
        reason: 'Content contains prompt injection',
        category: 'prompt_injection'
      };
      this.setCacheResult(content, result);
      
      throw new ContentSafetyError(
        SAFETY_RULES.PROMPT_INJECTION.TEMPLATE_LITERAL.message[language],
        'prompt_injection',
        language
      );
    }
    
    // Content is safe
    this.setCacheResult(content, { isSafe: true });
  }

  private checkPromptInjection(content: string): void {
    // Check all prompt injection patterns
    for (const [, rules] of Object.entries(SAFETY_RULES.PROMPT_INJECTION)) {
      for (const pattern of rules.patterns) {
        if (pattern.test(content)) {
          const lang = this.config.language || 'en';
          throw new ContentSafetyError(
            `Potential prompt injection detected: ${rules.name}`,
            'prompt_injection',
            lang
          );
        }
      }
    }

    // Check for suspicious repetition that might be used to overflow context
    const repetitionCheck = content.replace(/\s+/g, ' ').trim();
    if (repetitionCheck.length > 50) {  // Only check longer content
      const segments = repetitionCheck.split(' ');
      const uniqueSegments = new Set(segments);
      if (segments.length > 20 && uniqueSegments.size / segments.length < 0.3) {
        const lang = this.config.language || 'en';
        throw new ContentSafetyError(
          'Suspicious repetitive content detected',
          'repetitive_content',
          lang
        );
      }
    }
  }

  /**
   * Sanitizes the content by removing or modifying potentially unsafe content
   * @param content The content to sanitize
   * @returns Sanitized content
   */
  public sanitizeContent(content: string): string {
    if (this.config.enableUnicodeSafety) {
      content = this.normalizeUnicode(content);
    }
    
    // Basic sanitization - remove HTML tags
    content = content.replace(/<[^>]*>/g, '');
    
    // Remove potential script injections
    content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove potential markdown code block injections
    content = content.replace(/```(?:.*\n)*```/g, '');
    
    // Remove potential LaTeX injections
    content = content.replace(/\$\$(.*?)\$\$/g, '');
    content = content.replace(/\$(.*?)\$/g, '');
    
    // Remove backticks that might be used for code injection
    content = content.replace(/`/g, '');
    
    // Remove excessive whitespace
    content = content.replace(/\s+/g, ' ');
    
    return content.trim();
  }

  private normalizeUnicode(content: string): string {
    // Normalize unicode to remove alternative representations
    content = content.normalize('NFKC');
    
    // Remove characters from suspicious unicode ranges
    const ranges = Object.values(SAFETY_RULES.UNICODE);
    const suspicious = ranges.map(([start, end]) => {
      return String.fromCharCode(...Array(end - start + 1).fill(0).map((_, i) => start + i));
    }).join('');
    
    return content.replace(new RegExp(`[${suspicious}]`, 'g'), '');
  }

  private containsPromptInjection(content: string): boolean {
    // Check all prompt injection patterns, including system prompt patterns
    return Object.values(SAFETY_RULES.PROMPT_INJECTION).some(rule =>
      rule.patterns.some(pattern => pattern.test(content))
    ) || SAFETY_RULES.PROMPT_INJECTION.SYSTEM_PROMPT.patterns.some(pattern => 
      pattern.test(content)
    );
  }
}

// Initialize with default config for backward compatibility
export const contentSafetyService = new ContentSafetyService(); 