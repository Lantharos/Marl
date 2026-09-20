import type { CodeLines, HighlightResponse } from './types';

const aliases: Record<string, string> = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', rs: 'rust', py: 'python', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', yml: 'yaml', md: 'markdown', mdx: 'markdown', h: 'c', cc: 'cpp', hpp: 'cpp', cs: 'csharp', kt: 'kotlin', rb: 'ruby', ps1: 'powershell', tf: 'hcl' };
let worker: Worker | undefined;
let sequence = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, { resolve: (lines: CodeLines) => void; cleanup: () => void }>();

export function codeLanguage(path: string) {
  const name = path.split('/').at(-1)?.toLowerCase() ?? '';
  const value = name === 'dockerfile' || name === 'makefile' ? name : name === 'cmakelists.txt' ? 'cmake' : name.split('.').at(-1) ?? '';
  return aliases[value] ?? value;
}

function settle(id: number, lines: CodeLines) {
  const request = pending.get(id);
  if (!request) return;
  pending.delete(id); request.cleanup(); request.resolve(lines);
  if (!pending.size) idle = setTimeout(() => { worker?.terminate(); worker = undefined; }, 60_000);
}

export function highlight(source: string, language: string, signal?: AbortSignal): Promise<CodeLines> {
  if (signal?.aborted || !source || source.length > 1_048_576) return Promise.resolve([]);
  clearTimeout(idle);
  worker ??= new Worker(new URL('./highlight.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<HighlightResponse>) => settle(event.data.id, event.data.lines ?? []);
  worker.onerror = () => { worker?.terminate(); worker = undefined; for (const id of pending.keys()) settle(id, []); };
  const id = ++sequence;
  return new Promise(resolve => {
    const abort = () => settle(id, []);
    pending.set(id, { resolve, cleanup: () => signal?.removeEventListener('abort', abort) });
    signal?.addEventListener('abort', abort, { once: true });
    worker!.postMessage({ id, source, language: aliases[language] ?? language });
  });
}
