import { describe, expect, test } from 'bun:test';
import { parseMentionHandles } from './mentions';

describe('user mentions', () => {
  test('extracts unique handles with exact boundaries', () => {
    expect(parseMentionHandles('Ask @kristof and @review-team, then ping @Kristof again.')).toEqual(['kristof', 'review-team']);
  });

  test('ignores email addresses and code while preserving the full handle', () => {
    expect(parseMentionHandles('mail x@kristof.dev, not @kristoff or `@kristof`\n```ts\n@review-team\n```')).toEqual(['kristoff']);
  });
});
