import { sampleQuestions } from '../data/SampleQuestions';
import { contentSafetyService } from '../services/ContentSafety';
import { ContentSafetyError } from '../utils/errors';

describe('Sample Questions', () => {
  it('should have valid questions that do not trigger content safety restrictions', async () => {
    for (const { question, title } of sampleQuestions) {
      await expect(contentSafetyService.validateContent(question)).resolves.not.toThrow();
      await expect(contentSafetyService.validateResponse(question, 'vi')).resolves.not.toThrow();

      await expect(contentSafetyService.validateContent(title)).resolves.not.toThrow();
      await expect(contentSafetyService.validateResponse(title, 'vi')).resolves.not.toThrow();
    }
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