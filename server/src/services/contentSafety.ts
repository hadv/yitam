import { ContentSafetyError } from '../utils/errors';
import { Language } from '../types';

// Define unified safety rules
const SAFETY_RULES = {
  // Content topic restrictions
  RESTRICTED_TOPICS: {
    MEDICAL: {
      name: 'medical_advice',
      patterns: [
        // English patterns
        /\b(?:diagnos(?:is|e)|treat(?:ment)?|prescri(?:be|ption)|medicat(?:ion|e)|cure|symptom|disease|illness|doctor|medical advice)\b/i,
        // Vietnamese patterns
        /\b(?:chẩn\s*đoán|điều\s*trị|kê\s*đơn|thuốc|chữa|triệu\s*chứng|bệnh|ốm|bác\s*sĩ|tư\s*vấn\s*y\s*tế|khám|bệnh\s*viện)\b/iu,
      ],
      message: {
        en: 'medical advice',
        vi: 'tư vấn y tế'
      }
    },
    FINANCIAL: {
      name: 'financial_advice',
      patterns: [
        // English patterns
        /\b(?:invest(?:ment)?|stock|trade|crypto|financial advice|money advice|portfolio|dividend|market|broker)\b/i,
        // Vietnamese patterns
        /\b(?:đầu\s*tư|chứng\s*khoán|giao\s*dịch|tiền\s*ảo|tư\s*vấn\s*tài\s*chính|danh\s*mục|cổ\s*tức|thị\s*trường|môi\s*giới)\b/iu,
      ],
      message: {
        en: 'financial advice',
        vi: 'tư vấn tài chính'
      }
    },
    LEGAL: {
      name: 'legal_advice',
      patterns: [
        // English patterns
        /\b(?:legal advice|lawyer|attorney|lawsuit|sue|court|legal action|legal rights|legal obligation)\b/i,
        // Vietnamese patterns
        /\b(?:tư\s*vấn\s*pháp\s*luật|luật\s*sư|kiện|tòa\s*án|khởi\s*kiện|quyền\s*pháp\s*lý|nghĩa\s*vụ\s*pháp\s*lý)\b/iu,
      ],
      message: {
        en: 'legal advice',
        vi: 'tư vấn pháp luật'
      }
    },
    MARKETING: {
      name: 'product_marketing',
      patterns: [
        // English patterns
        /\b(?:buy|sell|product|service|discount|offer|deal|price|purchase|order|shipping)\b/i,
        // Vietnamese patterns
        /\b(?:mua|bán|sản\s*phẩm|dịch\s*vụ|giảm\s*giá|ưu\s*đãi|khuyến\s*mãi|giá|đặt\s*hàng|vận\s*chuyển)\b/iu,
      ],
      message: {
        en: 'product marketing',
        vi: 'quảng cáo sản phẩm'
      }
    },
    HARMFUL: {
      name: 'harmful_content',
      patterns: [
        // English patterns
        /\b(?:harm|hurt|injury|damage|weapon|explosive|poison|toxic)\b/i,
        // Vietnamese patterns
        /\b(?:gây\s*hại|tổn\s*thương|chấn\s*thương|thiệt\s*hại|vũ\s*khí|chất\s*nổ|độc|độc\s*hại)\b/iu,
      ],
      message: {
        en: 'harmful content',
        vi: 'nội dung gây hại'
      }
    },
    ADULT: {
      name: 'adult_content',
      patterns: [
        // English patterns
        /\b(?:explicit|adult|nsfw|xxx)\b/i,
        // Vietnamese patterns
        /\b(?:khiêu\s*dâm|người\s*lớn|nội\s*dung\s*nhạy\s*cảm)\b/iu,
      ],
      message: {
        en: 'adult content',
        vi: 'nội dung người lớn'
      }
    },
    GAMBLING: {
      name: 'gambling',
      patterns: [
        // English patterns
        /\b(?:gamble|betting|casino|poker|slot|wager)\b/i,
        // Vietnamese patterns
        /\b(?:cờ\s*bạc|đánh\s*bạc|sòng\s*bài|cá\s*cược|đặt\s*cược)\b/iu,
      ],
      message: {
        en: 'gambling',
        vi: 'cờ bạc'
      }
    },
    DRUGS: {
      name: 'drugs',
      patterns: [
        // English patterns
        /\b(?:drug|narcotic|substance|pill)\b/i,
        // Vietnamese patterns
        /\b(?:ma\s*túy|chất\s*gây\s*nghiện|thuốc\s*phiện|chất\s*kích\s*thích)\b/iu,
      ],
      message: {
        en: 'drugs',
        vi: 'ma túy'
      }
    },
  },

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
  enableTopicFiltering: boolean;
  enablePromptInjectionCheck: boolean;
  enableUnicodeSafety: boolean;
  language?: 'en' | 'vi';
  customBlockList?: string[];
}

const defaultConfig: ContentSafetyConfig = {
  maxMessageLength: 2000,
  enableTopicFiltering: true,
  enablePromptInjectionCheck: true,
  enableUnicodeSafety: true,
  language: 'vi',
};

export class ContentSafetyService {
  private config: ContentSafetyConfig;

  constructor(customConfig?: Partial<ContentSafetyConfig>) {
    this.config = { ...defaultConfig, ...customConfig };
  }

  /**
   * Validates the content against safety rules
   * @param content The content to validate
   * @throws ContentSafetyError if content violates safety rules
   */
  public validateContent(content: string): void {
    this.validateLength(content);
    
    if (this.config.enableTopicFiltering) {
      this.validateRestrictedTopics(content);
    }

    if (this.config.enablePromptInjectionCheck) {
      this.checkPromptInjection(content);
    }
  }

  /**
   * Validates the response content
   * Only checks for prompt injection attempts
   */
  public validateResponse(content: string, language: Language): void {
    // Check for prompt injection
    if (this.containsPromptInjection(content)) {
      throw new ContentSafetyError(
        SAFETY_RULES.PROMPT_INJECTION.TEMPLATE_LITERAL.message[language],
        language
      );
    }

    // Check for harmful content
    if (this.containsHarmfulContent(content)) {
      throw new ContentSafetyError(
        SAFETY_RULES.RESTRICTED_TOPICS.HARMFUL.message[language],
        language
      );
    }
  }

  /**
   * Validates the length of the content
   */
  private validateLength(content: string): void {
    if (content.length > this.config.maxMessageLength) {
      const lang = this.config.language || 'en';
      throw new ContentSafetyError(
        'Message exceeds maximum length limit',
        'length_exceeded',
        lang
      );
    }
  }

  private validateRestrictedTopics(content: string): void {
    for (const [, rules] of Object.entries(SAFETY_RULES.RESTRICTED_TOPICS)) {
      for (const pattern of rules.patterns) {
        if (pattern.test(content)) {
          const lang = this.config.language || 'en';
          throw new ContentSafetyError(
            `Content contains restricted topic: ${rules.message[lang]}`,
            'restricted_topic',
            lang
          );
        }
      }
    }
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

  private containsHarmfulContent(content: string): boolean {
    const harmfulRule = SAFETY_RULES.RESTRICTED_TOPICS.HARMFUL;
    return harmfulRule.patterns.some(pattern => pattern.test(content));
  }
}

export const contentSafetyService = new ContentSafetyService(); 