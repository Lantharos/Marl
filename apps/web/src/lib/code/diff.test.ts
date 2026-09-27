import { describe, expect, test } from 'bun:test';
import { parsePatchLines, reviewThreadContext } from './diff';

describe('unified diff parsing', () => {
  test('ignores file headers and parses hunk content by its diff prefix', () => {
    const lines = parsePatchLines([
      'diff --git a/example b/example',
      'index 1111111..2222222 100644',
      '--- a/example',
      '+++ b/example',
      '@@ -4,2 +4,2 @@ heading',
      '--- removed content',
      '+++ added content',
      ' context',
      '\\ No newline at end of file'
    ].join('\n'));

    expect(lines.map((line) => line.kind)).toEqual(['hunk', 'removed', 'added', 'context', 'hunk']);
    expect(lines[1]).toMatchObject({ oldLine: 4, newLine: null, line: 4 });
    expect(lines[2]).toMatchObject({ oldLine: null, newLine: 4, line: 4 });
    expect(lines[3]).toMatchObject({ oldLine: 5, newLine: 5, line: 5 });
  });

  test('does not turn metadata-only patches into source lines', () => {
    expect(parsePatchLines('diff --git a/image.png b/image.png\nBinary files differ')).toEqual([]);
  });
});

describe('review thread code context', () => {
  const patch = [
    '@@ -1,8 +1,8 @@',
    ' before',
    '-old two',
    '+new two',
    ' three',
    ' four',
    ' five',
    ' six',
    ' seven',
    ' after'
  ].join('\n');

  test('shows the selected range with adjacent context', () => {
    expect(reviewThreadContext(patch, 'new', 3, 4)).toEqual([
      { key: 3, kind: 'added', line: 2, text: 'new two', selected: false },
      { key: 4, kind: 'context', line: 3, text: 'three', selected: true },
      { key: 5, kind: 'context', line: 4, text: 'four', selected: true },
      { key: 6, kind: 'context', line: 5, text: 'five', selected: false }
    ]);
  });

  test('caps long ranges and reports the hidden lines', () => {
    const lines = reviewThreadContext(patch, 'new', 2, 7, 3);
    expect(lines.slice(1, 4).map((line) => line.kind === 'omitted' ? null : line.line)).toEqual([2, 3, 4]);
    expect(lines.at(-1)).toEqual({ key: 5.5, kind: 'omitted', count: 3 });
  });

  test('uses old line numbers for removed-side conversations', () => {
    expect(reviewThreadContext(patch, 'old', 2, 2).find((line) => line.kind !== 'omitted' && line.selected)).toMatchObject({ kind: 'removed', line: 2, text: 'old two' });
  });
});
