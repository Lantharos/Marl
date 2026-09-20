import { api } from '$lib/api';
import { codeLanguage, highlight } from './highlight';
import type { CodeLines, SourcePreview } from './types';

export type CodeRevision = { owner: string; repository: string; revision: string };
export type CodeComparison = { old?: CodeRevision; new: CodeRevision };
export type ComparisonTokens = { old: CodeLines; new: CodeLines };

export async function comparisonTokens(comparison: CodeComparison, path: string, oldPath: string, signal: AbortSignal): Promise<ComparisonTokens> {
  async function read(source: CodeRevision | undefined, file: string) {
    if (!source || !codeLanguage(file)) return [];
    const route = `/repositories/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/source/${encodeURIComponent(source.revision)}/${file.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const preview = await api<SourcePreview>(route, { signal });
      return preview.binary ? [] : await highlight(preview.content, codeLanguage(file), signal);
    } catch { return []; }
  }
  const [old, next] = await Promise.all([read(comparison.old, oldPath), read(comparison.new, path)]);
  return { old, new: next };
}
