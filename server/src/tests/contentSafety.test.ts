import { ContentSafetyService } from '../services/ContentSafety';
import { ContentSafetyError } from '../utils/errors';

describe('ContentSafetyService', () => {
  let safetyService: ContentSafetyService;

  beforeEach(() => {
    safetyService = new ContentSafetyService({
      language: 'vi',
      enablePromptInjectionCheck: true
    });
  });

  describe('validateResponse', () => {
    it('should allow medical and health-related content in Vietnamese', () => {
      const healthQueries = [
        // Medical advice queries
        'Tôi bị đau đầu thường xuyên, có cách nào chữa theo YHCT không?',
        'Làm thế nào để chữa chứng mất ngủ theo y học cổ truyền?',
        'Bạn có thể tư vấn về cách điều trị ho bằng thuốc nam không?',
        'Xin tư vấn về phương pháp châm cứu chữa đau lưng',
        'Có cách nào giảm stress bằng y học cổ truyền không?',
        
        // Financial advice queries
        'Làm thế nào để đầu tư chứng khoán hiệu quả?',
        'Tư vấn cách quản lý tài chính cá nhân',
        'Nên đầu tư vào Bitcoin hay không?',
        
        // Legal advice queries
        'Thủ tục đăng ký kết hôn cần những giấy tờ gì?',
        'Quyền lợi người lao động khi nghỉ việc',
        'Tư vấn về thủ tục ly hôn đơn phương',
        
        // Marketing content
        'Sản phẩm giảm giá 50% trong tuần này',
        'Ưu đãi đặc biệt cho khách hàng mới',
        'Mua 1 tặng 1 cho tất cả các mặt hàng'
      ];

      healthQueries.forEach(query => {
        expect(() => safetyService.validateResponse(query, 'vi')).not.toThrow();
      });
    });

    it('has basic content safety functionality', () => {
      // Just test that the service exists and has basic functionality
      expect(safetyService).toBeDefined();
      expect(typeof safetyService.validateContent).toBe('function');
      expect(typeof safetyService.validateResponse).toBe('function');
      expect(typeof safetyService.sanitizeContent).toBe('function');
      expect(typeof safetyService.checkPromptInjectionOnly).toBe('function');
    });
  });

  describe('AI validation', () => {
    // Returns a service whose AI client hands back a canned Messages API
    // response. aiClient is private and initializeAiClient() would construct a
    // real Anthropic client, so the stub is assigned through a cast.
    const serviceReturning = (content: unknown[]): ContentSafetyService => {
      const service = new ContentSafetyService({
        language: 'vi',
        enablePromptInjectionCheck: true
      });
      service.enableAiContentSafety(true);
      (service as unknown as { aiClient: unknown }).aiClient = {
        messages: { create: jest.fn().mockResolvedValue({ content }) }
      };
      return service;
    };

    const UNSAFE_VERDICT = JSON.stringify({
      isSafe: false,
      reason: 'instructions for harmful activity',
      category: 'harmful_content'
    });

    // Benign query, so anything that rejects it came from the AI verdict path
    // rather than from the regex rules.
    const QUERY = 'Xin tư vấn cách ngủ ngon hơn theo y học cổ truyền';

    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    // A check that fails to produce a verdict is not a verdict of "unsafe", and
    // it is not an all-clear either. Both failure shapes below must be reported
    // as plain Errors so validateContent() falls through to the regex
    // prompt-injection check, which is what it already does for network errors
    // and rate limits.
    it.each([
      [
        'the response is prose rather than a verdict',
        [{ type: 'text', text: 'Sorry, I could not complete that request.' }]
      ],
      [
        // A response whose output budget went entirely to thinking carries no
        // text block. Stringifying it yields valid JSON with no isSafe field,
        // so a missing verdict must not read as a verdict of "unsafe".
        'the response carries no text block at all',
        [{ type: 'thinking', thinking: '' }]
      ]
    ])('reports a plain Error, not a verdict, when %s', async (_label, content) => {
      const service = serviceReturning(content);

      await expect(service.validateContent(QUERY)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'AI content validation failed:',
        expect.any(Error)
      );
      // Rejecting here would also cache the message as unsafe, so retries would
      // keep failing from cache without another API call.
      expect(service.checkPromptInjectionOnly(QUERY, 'vi')).toBe(true);
    });

    it('still rejects content the AI marks unsafe', async () => {
      // Counterpart to the test above: only the failure path changed, so a real
      // verdict must still propagate as a ContentSafetyError.
      const service = serviceReturning([{ type: 'text', text: UNSAFE_VERDICT }]);

      await expect(service.validateContent(QUERY)).rejects.toBeInstanceOf(
        ContentSafetyError
      );
    });

    it('reads the verdict past a leading thinking block', async () => {
      // Models running adaptive thinking put a thinking block at content[0], so
      // the verdict has to be found by block type rather than by position.
      // Indexing content[0] would miss this verdict and let the content through.
      const service = serviceReturning([
        { type: 'thinking', thinking: '' },
        { type: 'text', text: UNSAFE_VERDICT }
      ]);

      await expect(service.validateContent(QUERY)).rejects.toBeInstanceOf(
        ContentSafetyError
      );
    });
  });
}); 