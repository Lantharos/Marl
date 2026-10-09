export type LogPiece = { text: string; style: string; match: 'none' | 'match' | 'current' };

const escapes = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]/g;

const palette = [
  'light-dark(#3e3c38,#d0cfcb)',
  'light-dark(#b83f45,#e16f73)',
  'light-dark(#27744c,#68b88c)',
  'light-dark(#91621f,#d3a45f)',
  'light-dark(#2f63a8,#7aa7e3)',
  'light-dark(#7449b8,#a887e0)',
  'light-dark(#1f7882,#5db6bd)',
  'light-dark(#5d5a54,#aaa9a4)',
  'light-dark(#716d67,#8c8b85)',
  'light-dark(#d0464d,#f08a8d)',
  'light-dark(#2f8a5b,#86d1a6)',
  'light-dark(#a87424,#e5bd7c)',
  'light-dark(#3a75c4,#9cc0f0)',
  'light-dark(#8659cc,#c3a8ef)',
  'light-dark(#24909b,#86d0d6)',
  'light-dark(#1b1a18,#f1f0ed)'
];

type Style = { fg?: string; bg?: string; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean };

export function stripAnsi(line: string) {
  return line.includes('\x1b') ? line.replace(escapes, '') : line;
}

function color256(index: number) {
  if (index < 16) return palette[index];
  if (index >= 232) {
    const level = 8 + (index - 232) * 10;
    return `rgb(${level} ${level} ${level})`;
  }
  const cube = index - 16;
  const channel = (value: number) => (value ? 55 + value * 40 : 0);
  return `rgb(${channel(Math.floor(cube / 36))} ${channel(Math.floor(cube / 6) % 6)} ${channel(cube % 6)})`;
}

function extendedColor(codes: number[], index: number): [string | undefined, number] {
  if (codes[index + 1] === 5) return [color256(codes[index + 2] ?? 0), index + 2];
  if (codes[index + 1] === 2)
    return [`rgb(${codes[index + 2] ?? 0} ${codes[index + 3] ?? 0} ${codes[index + 4] ?? 0})`, index + 4];
  return [undefined, index];
}

function applyCodes(style: Style, parameters: string): Style {
  const codes = parameters ? parameters.split(';').map(Number) : [0];
  let next = { ...style };
  for (let index = 0; index < codes.length; index++) {
    const code = codes[index];
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) next.bold = next.dim = false;
    else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code >= 30 && code <= 37) next.fg = palette[code - 30];
    else if (code >= 90 && code <= 97) next.fg = palette[code - 82];
    else if (code === 39) next.fg = undefined;
    else if (code >= 40 && code <= 47) next.bg = palette[code - 40];
    else if (code >= 100 && code <= 107) next.bg = palette[code - 92];
    else if (code === 49) next.bg = undefined;
    else if (code === 38 || code === 48) {
      const [value, consumed] = extendedColor(codes, index);
      if (code === 38) next.fg = value;
      else next.bg = value;
      index = consumed;
    }
  }
  return next;
}

function css(style: Style) {
  return [
    style.fg && `color:${style.fg}`,
    style.bg && `background:color-mix(in srgb,${style.bg} 22%,transparent)`,
    style.bold && 'font-weight:600',
    style.dim && 'opacity:.7',
    style.italic && 'font-style:italic',
    style.underline && 'text-decoration:underline'
  ]
    .filter(Boolean)
    .join(';');
}

function styledRuns(line: string) {
  if (!line.includes('\x1b')) return [{ text: line, style: '' }];
  const runs: Array<{ text: string; style: string }> = [];
  let style: Style = {};
  let cursor = 0;
  for (const match of line.matchAll(escapes)) {
    if (match.index > cursor) runs.push({ text: line.slice(cursor, match.index), style: css(style) });
    if (match[0].endsWith('m') && match[0].startsWith('\x1b[')) style = applyCodes(style, match[0].slice(2, -1));
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) runs.push({ text: line.slice(cursor), style: css(style) });
  return runs;
}

export function logPieces(line: string, matches: Array<[number, number]>, current: number): LogPiece[] {
  const runs = styledRuns(line);
  if (!matches.length) return runs.map((run) => ({ ...run, match: 'none' }));
  const pieces: LogPiece[] = [];
  let offset = 0;
  for (const run of runs) {
    const end = offset + run.text.length;
    let cursor = offset;
    for (const [index, [from, to]] of matches.entries()) {
      if (to <= cursor || from >= end) continue;
      const start = Math.max(from, cursor);
      if (start > cursor)
        pieces.push({ text: run.text.slice(cursor - offset, start - offset), style: run.style, match: 'none' });
      const stop = Math.min(to, end);
      pieces.push({
        text: run.text.slice(start - offset, stop - offset),
        style: run.style,
        match: index === current ? 'current' : 'match'
      });
      cursor = stop;
    }
    if (cursor < end) pieces.push({ text: run.text.slice(cursor - offset), style: run.style, match: 'none' });
    offset = end;
  }
  return pieces;
}
