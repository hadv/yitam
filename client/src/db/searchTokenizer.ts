/**
 * Tokenisation for the chat-history search index.
 *
 * Shared by every ChatHistoryStore implementation, so that two stores holding the
 * same messages answer the same query the same way. Vietnamese-tuned: shorter
 * minimum length and a longer maximum than an English tokeniser would use, because
 * compound words are common and meaningful two-letter words are not rare.
 */

const STOP_WORDS = new Set([
  // Common Vietnamese stop words
  'và', 'hoặc', 'là', 'của', 'có', 'không', 'được', 'các', 'những', 'một', 'trong',
  'để', 'từ', 'với', 'cho', 'bởi', 'tại', 'về', 'theo', 'trên', 'khi', 'như', 'nếu',
  'này', 'đã', 'đó', 'vì', 'sẽ', 'đến', 'phải', 'còn', 'bị', 'thì', 'cũng', 'nên',
  'rằng', 'tôi', 'bạn', 'họ', 'chúng', 'ta', 'mình', 'ai', 'mà', 'nhưng', 'hay',
  'làm', 'rất', 'thế', 'đang', 'lại', 'sau', 'trước', 'vậy', 'đây', 'kia', 'thật',
  'quá', 'cần', 'chỉ', 'đều', 'mới', 'cứ', 'lên', 'xuống', 'ra', 'vào', 'ngoài', 'qua'
]);

const MIN_WORD_LENGTH = 2;
const MAX_WORD_LENGTH = 40;

const splitWords = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\s+|[,.!?;:()"']/g)
    .map(word => word.trim())
    .filter(word => word.length > 0);

/** The distinct terms a message contributes to the index. */
export function tokenizeForIndex(content: string): string[] {
  const words = splitWords(content).filter(
    word =>
      word.length >= MIN_WORD_LENGTH &&
      word.length <= MAX_WORD_LENGTH &&
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word) // not just digits
  );

  return [...new Set(words)];
}

/**
 * The terms to look up for a query.
 *
 * Stop words are kept here on purpose: they are absent from the index, so a query
 * made only of them finds nothing rather than silently matching everything.
 */
export function tokenizeQuery(query: string): string[] {
  return splitWords(query).filter(word => word.length >= MIN_WORD_LENGTH);
}
