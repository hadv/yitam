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
    it('should allow medical and health-related content in Vietnamese', async () => {
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

      for (const query of healthQueries) {
        await expect(safetyService.validateResponse(query, 'vi')).resolves.not.toThrow();
      }
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
}); 