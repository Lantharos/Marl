import { describe, expect, test } from 'bun:test';
import { parsePatchLines } from './diff';

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
