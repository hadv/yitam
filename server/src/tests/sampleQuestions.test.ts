import { sampleQuestions } from '../data/sampleQuestions';
import { contentSafetyService } from '../services/contentSafety';
import { ContentSafetyError } from '../utils/errors';

describe('Sample Questions', () => {
  it('should have valid questions that do not trigger content safety restrictions', () => {
    sampleQuestions.forEach(({ question, title }) => {
      expect(() => {
        contentSafetyService.validateContent(question);
        contentSafetyService.validateResponse(question, 'vi');
      }).not.toThrow(ContentSafetyError);

      expect(() => {
        contentSafetyService.validateContent(title);
        contentSafetyService.validateResponse(title, 'vi');
      }).not.toThrow(ContentSafetyError);
    });
  });

  it('should have non-empty titles and questions', () => {
    sampleQuestions.forEach(({ question, title }) => {
      expect(question.trim()).not.toBe('');
      expect(title.trim()).not.toBe('');
    });
  });

  it('should have unique titles', () => {
    const titles = sampleQuestions.map(q => q.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });

  it('should have unique questions', () => {
    const questions = sampleQuestions.map(q => q.question);
    const uniqueQuestions = new Set(questions);
    expect(uniqueQuestions.size).toBe(questions.length);
  });
}); 