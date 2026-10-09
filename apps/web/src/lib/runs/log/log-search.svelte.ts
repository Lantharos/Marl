import { stripAnsi } from './ansi';
import type { LogBuffer } from './log-buffer.svelte';

export type LogMatch = { line: number; from: number; to: number };

const limit = 10_000;

export class LogSearch {
  query = $state('');
  current = $state(0);
  matches = $state.raw<LogMatch[]>([]);
  #byLine = new Map<number, Array<[number, number]>>();
  #pattern: RegExp | null = null;
  #indexed = '';
  #scanned = 0;

  constructor(private readonly buffer: LogBuffer) {}

  get capped() {
    return this.matches.length >= limit;
  }

  refresh() {
    const query = this.query.trim();
    const changed = query !== this.#indexed;
    if (changed) {
      this.#indexed = query;
      this.#pattern = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
      this.#byLine.clear();
      this.#scanned = 0;
      this.current = 0;
      this.matches = [];
    }
    if (!this.#pattern) return false;
    const count = this.buffer.count;
    const restart = Math.max(0, this.#scanned - 1);
    const kept = this.matches.filter((match) => match.line < restart);
    for (let line = restart; line < this.#scanned; line++) this.#byLine.delete(line);
    for (let line = restart; line < count && kept.length < limit; line++) {
      const ranges: Array<[number, number]> = [];
      for (const found of stripAnsi(this.buffer.line(line)).matchAll(this.#pattern)) {
        ranges.push([found.index, found.index + found[0].length]);
        kept.push({ line, from: found.index, to: found.index + found[0].length });
      }
      if (ranges.length) this.#byLine.set(line, ranges);
    }
    this.#scanned = count;
    this.matches = kept;
    return changed;
  }

  rangesOn(line: number) {
    void this.matches;
    return this.#byLine.get(line) ?? [];
  }

  currentOn(line: number) {
    const match = this.matches[this.current];
    if (!match || match.line !== line) return -1;
    return this.rangesOn(line).findIndex(([from]) => from === match.from);
  }

  step(direction: 1 | -1) {
    if (!this.matches.length) return null;
    this.current = (this.current + direction + this.matches.length) % this.matches.length;
    return this.matches[this.current];
  }
}
