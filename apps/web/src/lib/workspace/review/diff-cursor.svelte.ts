import type { PatchLine } from '#lib/code/diff.js';

export type LineDraft = { path: string; side: 'old' | 'new'; startLine: number; line: number };

export class DiffCursor {
  index = $state(-1);
  anchor = $state<number | null>(null);
  draft = $state.raw<LineDraft | null>(null);
  body = $state('');
  #lines: () => PatchLine[];

  constructor(lines: () => PatchLine[]) {
    this.#lines = lines;
  }

  get lines() {
    return this.#lines();
  }

  get line() {
    return this.lines[this.index];
  }

  reset() {
    this.index = this.lines.findIndex((line) => line.kind !== 'hunk');
    this.anchor = null;
    this.draft = null;
    this.body = '';
  }

  place = (index: number, extend = false) => {
    const line = this.lines[index];
    if (!line || line.kind === 'hunk') return;
    if (extend) this.anchor ??= this.index;
    else this.anchor = null;
    this.index = index;
  };

  move(delta: 1 | -1, extend: boolean) {
    let next = this.index + delta;
    while (this.lines[next]?.kind === 'hunk') next += delta;
    this.place(next, extend);
  }

  jump(direction: 1 | -1, threaded: (line: PatchLine) => boolean) {
    const stops = this.lines.flatMap((line, index) =>
      line.kind !== 'hunk' && (this.lines[index - 1]?.kind === 'hunk' || threaded(line)) ? [index] : []
    );
    const next =
      direction === 1 ? stops.find((stop) => stop > this.index) : stops.findLast((stop) => stop < this.index);
    if (next === undefined) return false;
    this.place(next);
    return true;
  }

  selected(index: number) {
    if (this.anchor === null) return index === this.index;
    return index >= Math.min(this.anchor, this.index) && index <= Math.max(this.anchor, this.index);
  }

  open(path: string, allowOld: boolean) {
    const line = this.line;
    if (!line?.side || line.line === null || (line.side === 'old' && !allowOld)) return false;
    const from = Math.min(this.anchor ?? this.index, this.index);
    const to = Math.max(this.anchor ?? this.index, this.index);
    const numbers = this.lines
      .slice(from, to + 1)
      .flatMap((candidate) => (candidate.side === line.side && candidate.line !== null ? [candidate.line] : []));
    this.draft = { path, side: line.side, startLine: Math.min(...numbers), line: Math.max(...numbers) };
    this.anchor = null;
    return true;
  }

  close() {
    this.draft = null;
    this.body = '';
  }
}
