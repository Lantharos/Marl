import { stripAnsi } from './ansi';

export type LogSection = {
  name: string | null;
  header: number;
  startedAt: number | null;
  continued: boolean;
  timedOut: boolean;
};

const stepHeader = /^── (.+) ──$/;
const continuedStep = /^Step failed with exit code \d+; continuing\.$/;
const timedOutStep = /^Step timed out after \d+ seconds\.$/;

function settle(line: string) {
  const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
  const carriage = trimmed.lastIndexOf('\r');
  return carriage === -1 ? trimmed : trimmed.slice(carriage + 1);
}

function columns(line: string) {
  const plain = stripAnsi(line);
  let tabs = 0;
  for (let index = plain.indexOf('\t'); index !== -1; index = plain.indexOf('\t', index + 1)) tabs++;
  return plain.length + tabs * 7;
}

export class LogBuffer {
  version = $state(0);
  lines: string[] = [''];
  sections: LogSection[] = [{ name: null, header: -1, startedAt: null, continued: false, timedOut: false }];
  #widest = 0;
  #scanned = 0;

  get widest() {
    void this.version;
    return this.#widest;
  }

  get count() {
    void this.version;
    return this.lines.length - (this.lines[this.lines.length - 1] === '' ? 1 : 0);
  }

  line(index: number) {
    if (index < this.#scanned) return this.lines[index];
    void this.version;
    return settle(this.lines[index]);
  }

  sectionEnd(index: number) {
    return this.sections[index + 1]?.header ?? this.count;
  }

  append(text: string, time: number | null) {
    if (!text) return;
    const parts = text.split('\n');
    this.lines[this.lines.length - 1] += parts[0];
    for (let index = 1; index < parts.length; index++) this.lines.push(parts[index]);
    this.#scan(time);
    this.version++;
  }

  #scan(time: number | null) {
    const complete = this.lines.length - 1;
    const first = this.sections[0];
    if (first.startedAt === null && time !== null) first.startedAt = time;
    for (let index = this.#scanned; index < complete; index++) {
      const line = settle(this.lines[index]);
      this.lines[index] = line;
      this.#widest = Math.max(this.#widest, columns(line));
      const header = stepHeader.exec(line);
      const section = this.sections[this.sections.length - 1];
      if (header) {
        this.sections.push({ name: header[1], header: index, startedAt: time, continued: false, timedOut: false });
      } else if (continuedStep.test(line)) section.continued = true;
      else if (timedOutStep.test(line)) section.timedOut = true;
    }
    this.#scanned = complete;
  }
}
