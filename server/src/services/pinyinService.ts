import pinyin from 'pinyin';

/**
 * Service for converting Chinese characters to Pinyin
 */
export class PinyinService {
  /**
   * Convert Chinese characters to Pinyin with tone marks
   * @param chineseText - Chinese characters to convert
   * @param options - Conversion options
   * @returns Pinyin string with tone marks
   */
  static convertToPinyin(
    chineseText: string, 
    options: {
      style?: 'tone' | 'tone2' | 'normal' | 'initials' | 'first_letter';
      heteronym?: boolean;
      segment?: boolean;
    } = {}
  ): string {
    if (!chineseText || typeof chineseText !== 'string') {
      return '';
    }

    // Clean the input text
    const cleanText = chineseText.trim();
    if (!cleanText) {
      return '';
    }

    try {
      // Default options for acupoint names
      const defaultOptions = {
        style: 'tone' as const, // Use tone marks (e.g., hégǔ)
        heteronym: false, // Don't return multiple pronunciations
        segment: true, // Enable word segmentation for better accuracy
        ...options
      };

      // Convert to pinyin
      const pinyinArray = pinyin(cleanText, defaultOptions);
      
      // Join the pinyin syllables with spaces
      const result = pinyinArray.map((syllable: string[]) => syllable[0]).join(' ');
      
      return result;
    } catch (error) {
      console.error('Error converting Chinese to Pinyin:', error);
      return '';
    }
  }

  /**
   * Convert Chinese characters to Pinyin without tone marks
   * @param chineseText - Chinese characters to convert
   * @returns Pinyin string without tone marks
   */
  static convertToNormalPinyin(chineseText: string): string {
    return this.convertToPinyin(chineseText, { style: 'normal' });
  }

  /**
   * Convert Chinese characters to Pinyin with numeric tones
   * @param chineseText - Chinese characters to convert
   * @returns Pinyin string with numeric tones (e.g., he2gu3)
   */
  static convertToNumericPinyin(chineseText: string): string {
    return this.convertToPinyin(chineseText, { style: 'tone2' });
  }

  /**
   * Get first letters only (initials)
   * @param chineseText - Chinese characters to convert
   * @returns First letters of each syllable
   */
  static convertToInitials(chineseText: string): string {
    return this.convertToPinyin(chineseText, { style: 'first_letter' });
  }

  /**
   * Validate if a string contains Chinese characters
   * @param text - Text to validate
   * @returns True if contains Chinese characters
   */
  static containsChinese(text: string): boolean {
    if (!text) return false;
    // Unicode range for Chinese characters (CJK Unified Ideographs)
    const chineseRegex = /[\u4e00-\u9fff]/;
    return chineseRegex.test(text);
  }

  /**
   * Auto-generate Pinyin for acupoint data
   * This method is specifically designed for acupoint names
   * @param chineseCharacters - Chinese characters for the acupoint
   * @returns Formatted Pinyin suitable for acupoint names
   */
  static generateAcupointPinyin(chineseCharacters: string): string {
    if (!this.containsChinese(chineseCharacters)) {
      return '';
    }

    // For acupoint names, we want tone marks and proper spacing
    const pinyin = this.convertToPinyin(chineseCharacters, {
      style: 'tone',
      segment: true,
      heteronym: false
    });

    // Clean up the result - ensure proper capitalization for first letter
    return pinyin.split(' ')
      .map((syllable: string) => syllable.toLowerCase())
      .join('');
  }

  /**
   * Batch convert multiple Chinese texts to Pinyin
   * @param chineseTexts - Array of Chinese texts
   * @returns Array of corresponding Pinyin texts
   */
  static batchConvert(chineseTexts: string[]): string[] {
    return chineseTexts.map(text => this.convertToPinyin(text));
  }
}

export default PinyinService;
