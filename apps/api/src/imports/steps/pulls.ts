import { identifier } from '../../core/domain';
import { pinPullRefs } from '../../git/writes';
import { rewriteReferences, type GitHubUser } from '../github';
import { resolveAuthors } from '../people';
import { labelIds, pageResult, pullNumbers, timestamp, type StepContext, type StepResult } from './context';
import type { GitHubLabel } from './issues';

type Pull = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  draft: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string; sha: string; repo: { full_name: string; owner: { login: string } } | null };
  base: { ref: string; sha: string; repo: { full_name: string } };
};

function sourceBranch(pull: Pull) {
  if (pull.head.repo?.full_name === pull.base.repo.full_name) return pull.head.ref;
  return `${pull.head.repo?.owner.login ?? 'deleted'}:${pull.head.ref}`;
}

async function branchHeads(context: StepContext) {
  const rows = await context.env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=?')
    .bind(context.row.repositoryId)
    .all<{ name: string; commitId: string }>();
  return new Map(rows.results.map((row) => [row.name, row.commitId]));
}

export async function importPulls(context: StepContext): Promise<StepResult> {
  const { env, row, github, importer, repositoryPath, page } = context;
  const pulls = await github<Pull[]>(`${repositoryPath}/pulls?state=all&sort=created&direction=asc&${page}`);
  const [author, numbers, labels, heads] = await Promise.all([
    resolveAuthors(
      env,
      pulls.map((pull) => pull.user),
      importer
    ),
    pullNumbers(env, row.repositoryId),
    labelIds(env, row.repositoryId),
    branchHeads(context)
  ]);
  for (const pull of pulls) numbers.add(pull.number);
  const ids = pulls.map(() => identifier('pr'));
  const target = (pull: Pull) => (pull.state === 'open' ? (heads.get(pull.base.ref) ?? pull.base.sha) : pull.base.sha);
  await env.DB.batch(
    pulls.flatMap((pull, index) => [
      env.DB.prepare(
        `INSERT OR IGNORE INTO pull_requests (id,repository_id,number,title,body,author_id,source_branch,target_branch,source_commit_id,target_commit_id,state,merged_commit_id,merged_at,merge_method,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        ids[index],
        row.repositoryId,
        pull.number,
        pull.title,
        rewriteReferences(pull.body, numbers),
        author(pull.user),
        sourceBranch(pull),
        pull.base.ref,
        pull.head.sha,
        target(pull),
        pull.merged_at ? 'merged' : pull.state === 'closed' ? 'closed' : pull.draft ? 'draft' : 'open',
        pull.merged_at ? pull.merge_commit_sha : null,
        timestamp(pull.merged_at),
        pull.merged_at ? 'merge' : null,
        timestamp(pull.created_at),
        timestamp(pull.updated_at)
      ),
      ...pull.labels
        .map((label) => labels.get(label.name.toLowerCase()))
        .filter((id): id is string => Boolean(id))
        .map((labelId) =>
          env.DB.prepare('INSERT OR IGNORE INTO pull_request_labels (pull_request_id,label_id) VALUES (?,?)').bind(
            ids[index],
            labelId
          )
        )
    ])
  );
  for (const pull of pulls.filter((item) => item.state === 'open'))
    await pinPullRefs(env, {
      owner: row.owner,
      repository: row.name,
      number: pull.number,
      sourceCommitId: pull.head.sha,
      targetCommitId: target(pull)
    }).catch(() => null);
  return pageResult(context, pulls.length, { pulls: pulls.length });
}
