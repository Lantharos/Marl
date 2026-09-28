import type { Env } from '../../core/platform';
import type { githubClient } from '../github';

export type ImportRow = {
  id: string;
  repositoryId: string;
  organizationId: string;
  owner: string;
  name: string;
  requestedBy: string;
  source: string;
  defaultBranch: string;
  tokenCiphertext: string | null;
  tokenNonce: string | null;
  githubLogin: string | null;
  optionsJson: string;
  step: Step;
  cursor: number;
  statsJson: string;
};

export type Step =
  | 'git'
  | 'labels'
  | 'pulls'
  | 'reviews'
  | 'review_comments'
  | 'issues'
  | 'comments'
  | 'releases'
  | 'assets'
  | 'finished';
export type ActiveStep = Exclude<Step, 'finished'>;
export type StepResult = { step: Step; cursor: number; counts?: Record<string, number> };

export type StepContext = {
  env: Env;
  row: ImportRow;
  token: string | null;
  github: ReturnType<typeof githubClient>;
  importer: { login: string | null; userId: string };
  repositoryPath: string;
  page: string;
  next: () => Step;
};

export const perPage = 100;

export function pageResult(context: StepContext, fetched: number, counts: Record<string, number>): StepResult {
  return fetched === perPage
    ? { step: context.row.step, cursor: context.row.cursor + 1, counts }
    : { step: context.next(), cursor: 1, counts };
}

export function timestamp(value: string | null) {
  return value ? value.replace('T', ' ').replace('Z', '') : null;
}

export async function pullNumbers(env: Env, repositoryId: string) {
  const rows = await env.DB.prepare('SELECT number FROM pull_requests WHERE repository_id=?')
    .bind(repositoryId)
    .all<{ number: number }>();
  return new Set(rows.results.map((row) => row.number));
}

export async function labelIds(env: Env, repositoryId: string) {
  const rows = await env.DB.prepare('SELECT id,name FROM repository_labels WHERE repository_id=?')
    .bind(repositoryId)
    .all<{ id: string; name: string }>();
  return new Map(rows.results.map((row) => [row.name.toLowerCase(), row.id]));
}
