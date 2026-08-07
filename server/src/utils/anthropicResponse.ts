import type Anthropic from '@anthropic-ai/sdk';

/**
 * Returns the text of the first text block in a Messages API response.
 *
 * Never index `response.content[0]` directly. On models where adaptive thinking
 * is on — the default on Claude Sonnet 5 and Opus 5 when `thinking` is omitted —
 * `content[0]` is a thinking block, not the text block, so the usual
 * `content[0].type === 'text'` check silently fails and the response looks empty.
 *
 * Returns undefined when the response contains no text block at all.
 */
export function getResponseText(response: Anthropic.Message): string | undefined {
  const block = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  return block?.text;
}
