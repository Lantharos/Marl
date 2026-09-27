export type PatchLine = {
  key: number;
  kind: 'hunk' | 'context' | 'added' | 'removed';
  text: string;
  oldLine: number | null;
  newLine: number | null;
  side: 'old' | 'new' | null;
  line: number | null;
};

export type ThreadCodeLine = {
  key: number;
  kind: 'context' | 'added' | 'removed';
  line: number;
  text: string;
  selected: boolean;
} | {
  key: number;
  kind: 'omitted';
  count: number;
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

export function reviewThreadContext(patch: string, side: 'old' | 'new', startLine: number, endLine: number, maxSelected = 5): ThreadCodeLine[] {
  const candidates = parsePatchLines(patch)
    .filter((line) => line.kind !== 'hunk')
    .map((line) => ({ line, number: side === 'old' ? line.oldLine : line.newLine }))
    .filter((entry): entry is { line: PatchLine; number: number } => entry.number !== null);
  const selected = candidates.filter((entry) => entry.number >= startLine && entry.number <= endLine);
  if (selected.length === 0) return [];

  const shown = selected.slice(0, Math.max(1, maxSelected));
  const first = candidates.indexOf(shown[0]);
  const last = candidates.indexOf(shown[shown.length - 1]);
  const context = first > 0 ? [candidates[first - 1]] : [];
  const after = selected.length === shown.length && last < candidates.length - 1 ? [candidates[last + 1]] : [];
  const lines: ThreadCodeLine[] = [...context, ...shown, ...after].map(({ line, number }) => ({
    key: line.key,
    kind: line.kind as Exclude<PatchLine['kind'], 'hunk'>,
    line: number,
    text: line.text.slice(1),
    selected: number >= startLine && number <= endLine
  }));
  if (selected.length > shown.length) lines.push({ key: shown[shown.length - 1].line.key + 0.5, kind: 'omitted', count: selected.length - shown.length });
  return lines;
}
