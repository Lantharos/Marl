import type { Env } from '../../core/platform';
import { decryptSecret } from '../../core/secret-crypto';
import { githubClient } from '../github';
import { importComments } from './comments';
import { perPage, type ActiveStep, type ImportRow, type Step, type StepContext, type StepResult } from './context';
import { importGit } from './git';
import { importIssues, importLabels } from './issues';
import { importPulls } from './pulls';
import { importReleaseAssets, importReleases } from './releases';
import { importReviewComments, importReviews } from './reviews';

export type { ImportRow } from './context';

const order: ActiveStep[] = [
  'git',
  'labels',
  'pulls',
  'reviews',
  'review_comments',
  'issues',
  'comments',
  'releases',
  'assets'
];
type ImportOption = 'issues' | 'pulls' | 'releases';

const requiredOptions: Partial<Record<ActiveStep, ImportOption[]>> = {
  pulls: ['pulls'],
  reviews: ['pulls'],
  review_comments: ['pulls'],
  issues: ['issues'],
  comments: ['issues', 'pulls'],
  releases: ['releases'],
  assets: ['releases']
};
const handlers: Record<ActiveStep, (context: StepContext) => Promise<StepResult>> = {
  git: importGit,
  labels: importLabels,
  pulls: importPulls,
  reviews: importReviews,
  review_comments: importReviewComments,
  issues: importIssues,
  comments: importComments,
  releases: importReleases,
  assets: importReleaseAssets
};

function advance(step: ActiveStep, options: Partial<Record<ImportOption, boolean>>): Step {
  for (const next of order.slice(order.indexOf(step) + 1)) {
    const required = requiredOptions[next];
    if (!required || required.some((option) => options[option] !== false)) return next;
  }
  return 'finished';
}

async function importToken(env: Env, row: ImportRow) {
  if (!row.tokenCiphertext || !row.tokenNonce) return null;
  return decryptSecret(env, {
    organizationId: row.organizationId,
    repositoryId: row.repositoryId,
    name: `import:${row.id}`,
    ciphertext: row.tokenCiphertext,
    nonce: row.tokenNonce
  });
}

export async function runStep(env: Env, row: ImportRow): Promise<StepResult> {
  const options = JSON.parse(row.optionsJson) as Partial<Record<ImportOption, boolean>>;
  const step = row.step as ActiveStep;
  const token = await importToken(env, row);
  return handlers[step]({
    env,
    row,
    token,
    github: githubClient(token),
    importer: { login: row.githubLogin, userId: row.requestedBy },
    repositoryPath: `/repos/${row.source}`,
    page: `per_page=${perPage}&page=${row.cursor}`,
    next: () => advance(step, options)
  });
}
