import { identifier } from '../../core/domain';
import { rewriteReferences, type GitHubUser } from '../github';
import { resolveAuthors } from '../people';
import { labelIds, pageResult, pullNumbers, timestamp, type StepContext, type StepResult } from './context';

export type GitHubLabel = { name: string; color: string; description: string | null };
type Issue = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
};

export async function importLabels(context: StepContext): Promise<StepResult> {
  const { env, row, github, repositoryPath, page } = context;
  const labels = await github<GitHubLabel[]>(`${repositoryPath}/labels?${page}`);
  await env.DB.batch(
    labels.map((label) =>
      env.DB.prepare(
        'INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?) ON CONFLICT(repository_id,name) DO UPDATE SET color=excluded.color,description=excluded.description'
      ).bind(identifier('label'), row.repositoryId, label.name, `#${label.color}`, label.description ?? '')
    )
  );
  return pageResult(context, labels.length, { labels: labels.length });
}

export async function importIssues(context: StepContext): Promise<StepResult> {
  const { env, row, github, importer, repositoryPath, page } = context;
  const items = await github<Issue[]>(`${repositoryPath}/issues?state=all&sort=created&direction=asc&${page}`);
  const issues = items.filter((item) => !item.pull_request);
  const [author, numbers, labels] = await Promise.all([
    resolveAuthors(
      env,
      issues.map((issue) => issue.user),
      importer
    ),
    pullNumbers(env, row.repositoryId),
    labelIds(env, row.repositoryId)
  ]);
  const ids = issues.map(() => identifier('issue'));
  if (issues.length)
    await env.DB.batch(
      issues.flatMap((issue, index) => [
        env.DB.prepare(
          'INSERT OR IGNORE INTO issues (id,repository_id,number,title,body,author_id,state,closed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).bind(
          ids[index],
          row.repositoryId,
          issue.number,
          issue.title,
          rewriteReferences(issue.body, numbers),
          author(issue.user),
          issue.state,
          timestamp(issue.closed_at),
          timestamp(issue.created_at),
          timestamp(issue.updated_at)
        ),
        ...issue.labels
          .map((label) => labels.get(label.name.toLowerCase()))
          .filter((id): id is string => Boolean(id))
          .map((labelId) =>
            env.DB.prepare('INSERT OR IGNORE INTO issue_labels (issue_id,label_id) VALUES (?,?)').bind(
              ids[index],
              labelId
            )
          )
      ])
    );
  return pageResult(context, items.length, { issues: issues.length });
}
