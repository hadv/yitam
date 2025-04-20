export class HTMLFormatter {
  /**
   * Safely escapes HTML for attribute values
   */
  static safeEscapeHtml(str: string): string {
    if (!str) return '';
    
    // First encode for HTML display
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  /**
   * Escapes HTML for content display
   */
  static contentEscapeHtml(str: string): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  /**
   * Safely stringifies JSON with error handling
   */
  static jsonSafeStringify(obj: any, indent: number = 2): string {
    try {
      return JSON.stringify(obj, (key, value) => {
        // Handle special cases for JSON stringification
        if (typeof value === 'string') {
          // Ensure strings are properly escaped but still valid JSON
          return value;
        }
        return value;
      }, indent);
    } catch (e) {
      console.error("Error stringifying object:", e);
      return String(obj);
    }
  }
} 