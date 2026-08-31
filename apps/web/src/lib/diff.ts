export type PatchLine = {
  key: number;
  kind: 'hunk' | 'context' | 'added' | 'removed';
  text: string;
  oldLine: number | null;
  newLine: number | null;
  side: 'old' | 'new' | null;
  line: number | null;
};

export function parsePatchLines(patch: string): PatchLine[] {
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const output: PatchLine[] = [];
  const source = patch.endsWith('\n') ? patch.slice(0, -1) : patch;
  if (!source) return output;

  for (const text of source.split('\n')) {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      output.push({ key: output.length, kind: 'hunk', text, oldLine: null, newLine: null, side: null, line: null });
      continue;
    }
    if (text.startsWith('diff --git ')) {
      inHunk = false;
      continue;
    }
    if (!inHunk) continue;
    if (text.startsWith('\\ No newline at end of file')) {
      output.push({ key: output.length, kind: 'hunk', text, oldLine: null, newLine: null, side: null, line: null });
    } else if (text.startsWith('+')) {
      output.push({ key: output.length, kind: 'added', text, oldLine: null, newLine, side: 'new', line: newLine++ });
    } else if (text.startsWith('-')) {
      output.push({ key: output.length, kind: 'removed', text, oldLine, newLine: null, side: 'old', line: oldLine++ });
    } else if (text.startsWith(' ')) {
      output.push({ key: output.length, kind: 'context', text, oldLine, newLine, side: 'new', line: newLine });
      oldLine += 1;
      newLine += 1;
    }
  }
  return output;
}
