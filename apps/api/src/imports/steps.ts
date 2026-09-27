import type { Env } from '../core/platform';
import { identifier } from '../core/domain';
import { decryptSecret } from '../core/secret-crypto';
import { requestGitGateway } from '../git/gateway';
import { pinPullRefs } from '../git/writes';
import { githubClient, rewriteReferences, type GitHubUser } from './github';
import { resolveAuthors } from './people';

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

type Step = 'git' | 'labels' | 'pulls' | 'issues' | 'comments' | 'releases' | 'finished';
type Label = { name: string; color: string; description: string | null };
type Issue = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  labels: Label[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
};
type Pull = Omit<Issue, 'pull_request'> & {
  draft: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string; sha: string; repo: { full_name: string; owner: { login: string } } | null };
  base: { ref: string; sha: string; repo: { full_name: string } };
};
type Comment = {
  id: number;
  body: string;
  user: GitHubUser;
  issue_url: string;
  created_at: string;
  updated_at: string;
};
type Release = {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  author: GitHubUser;
  created_at: string;
  published_at: string | null;
};

export type StepResult = { step: Step; cursor: number; counts?: Record<string, number> };

const perPage = 100;
const nextStep: Record<Exclude<Step, 'finished'>, Step> = {
  git: 'labels',
  labels: 'pulls',
  pulls: 'issues',
  issues: 'comments',
  comments: 'releases',
  releases: 'finished'
};

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

function advance(step: Exclude<Step, 'finished'>, options: Record<string, boolean>): Step {
  let next = nextStep[step];
  while (next !== 'finished' && options[next] === false) next = nextStep[next as Exclude<Step, 'finished'>];
  return next;
}

async function pullNumbers(env: Env, repositoryId: string) {
  const rows = await env.DB.prepare('SELECT number FROM pull_requests WHERE repository_id=?')
    .bind(repositoryId)
    .all<{ number: number }>();
  return new Set(rows.results.map((row) => row.number));
}

async function labelIds(env: Env, repositoryId: string) {
  const rows = await env.DB.prepare('SELECT id,name FROM repository_labels WHERE repository_id=?')
    .bind(repositoryId)
    .all<{ id: string; name: string }>();
  return new Map(rows.results.map((row) => [row.name.toLowerCase(), row.id]));
}

function sourceBranch(pull: Pull) {
  if (pull.head.repo?.full_name === pull.base.repo.full_name) return pull.head.ref;
  return `${pull.head.repo?.owner.login ?? 'deleted'}:${pull.head.ref}`;
}

function timestamp(value: string | null) {
  return value ? value.replace('T', ' ').replace('Z', '') : null;
}

export async function runStep(env: Env, row: ImportRow): Promise<StepResult> {
  const options = JSON.parse(row.optionsJson) as Record<string, boolean>;
  const step = row.step as Exclude<Step, 'finished'>;
  const token = await importToken(env, row);
  const github = githubClient(token);
  const importer = { login: row.githubLogin, userId: row.requestedBy };
  const repositoryPath = `/repos/${row.source}`;
  const page = `per_page=${perPage}&page=${row.cursor}`;

  if (step === 'git') {
    const response = await requestGitGateway(
      env,
      '/_marl/import',
      {
        owner: row.owner,
        repository: row.name,
        repositoryId: row.repositoryId,
        actorId: row.requestedBy,
        source: `https://github.com/${row.source}`,
        token: token ?? undefined,
        defaultBranch: row.defaultBranch
      },
      { attempts: 1, timeoutMs: 900_000 }
    );
    if (!response.ok) throw new Error((await response.text()) || 'The repository could not be fetched from GitHub.');
    return { step: advance(step, options), cursor: 1 };
  }

  if (step === 'labels') {
    const labels = await github<Label[]>(`${repositoryPath}/labels?${page}`);
    await env.DB.batch(
      labels.map((label) =>
        env.DB.prepare(
          'INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?) ON CONFLICT(repository_id,name) DO UPDATE SET color=excluded.color,description=excluded.description'
        ).bind(identifier('label'), row.repositoryId, label.name, `#${label.color}`, label.description ?? '')
      )
    );
    return labels.length === perPage
      ? { step, cursor: row.cursor + 1, counts: { labels: labels.length } }
      : { step: advance(step, options), cursor: 1, counts: { labels: labels.length } };
  }

  if (step === 'pulls') {
    const pulls = await github<Pull[]>(`${repositoryPath}/pulls?state=all&sort=created&direction=asc&${page}`);
    const [author, numbers, labels] = await Promise.all([
      resolveAuthors(
        env,
        pulls.map((pull) => pull.user),
        importer
      ),
      pullNumbers(env, row.repositoryId),
      labelIds(env, row.repositoryId)
    ]);
    for (const pull of pulls) numbers.add(pull.number);
    const ids = pulls.map(() => identifier('pr'));
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
          pull.base.sha,
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
    for (const pull of pulls.filter((item) => item.state === 'open' && !sourceBranch(item).includes(':')))
      await pinPullRefs(env, {
        owner: row.owner,
        repository: row.name,
        number: pull.number,
        sourceCommitId: pull.head.sha,
        targetCommitId: pull.base.sha
      }).catch(() => null);
    return pulls.length === perPage
      ? { step, cursor: row.cursor + 1, counts: { pulls: pulls.length } }
      : { step: advance(step, options), cursor: 1, counts: { pulls: pulls.length } };
  }

  if (step === 'issues') {
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
    return items.length === perPage
      ? { step, cursor: row.cursor + 1, counts: { issues: issues.length } }
      : { step: advance(step, options), cursor: 1, counts: { issues: issues.length } };
  }

  if (step === 'comments') {
    const comments = await github<Comment[]>(`${repositoryPath}/issues/comments?sort=created&direction=asc&${page}`);
    const [author, numbers] = await Promise.all([
      resolveAuthors(
        env,
        comments.map((comment) => comment.user),
        importer
      ),
      pullNumbers(env, row.repositoryId)
    ]);
    const statements = [];
    for (const comment of comments) {
      const number = Number(comment.issue_url.split('/').at(-1));
      const body = rewriteReferences(comment.body, numbers);
      const values = [
        `comment_github_${comment.id}`,
        author(comment.user),
        body,
        timestamp(comment.created_at),
        timestamp(comment.updated_at),
        row.repositoryId,
        number
      ];
      statements.push(
        numbers.has(number)
          ? env.DB.prepare(
              'INSERT OR IGNORE INTO pull_request_comments (id,pull_request_id,author_id,body,created_at,updated_at) SELECT ?,id,?,?,?,? FROM pull_requests WHERE repository_id=? AND number=?'
            ).bind(...values)
          : env.DB.prepare(
              'INSERT OR IGNORE INTO issue_comments (id,issue_id,author_id,body,created_at,updated_at) SELECT ?,id,?,?,?,? FROM issues WHERE repository_id=? AND number=?'
            ).bind(...values)
      );
    }
    if (statements.length) await env.DB.batch(statements);
    return comments.length === perPage
      ? { step, cursor: row.cursor + 1, counts: { comments: comments.length } }
      : { step: advance(step, options), cursor: 1, counts: { comments: comments.length } };
  }

  const releases = await github<Release[]>(`${repositoryPath}/releases?${page}`);
  const tags = await requestGitGateway(env, '/_marl/tags/list', { owner: row.owner, repository: row.name })
    .then((response) => response.json<{ tags: Array<{ name: string; targetCommitId: string }> }>())
    .catch(() => ({ tags: [] }));
  const targets = new Map(tags.tags.map((tag) => [tag.name, tag.targetCommitId]));
  const author = await resolveAuthors(
    env,
    releases.map((release) => release.author),
    importer
  );
  const numbers = await pullNumbers(env, row.repositoryId);
  const importable = releases.filter((release) => !release.draft && targets.has(release.tag_name));
  if (importable.length)
    await env.DB.batch(
      importable.map((release) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO releases (id,repository_id,tag_name,target_commit_id,name,body,author_id,draft,prerelease,latest,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,0,?,0,?,?,?)'
        ).bind(
          identifier('release'),
          row.repositoryId,
          release.tag_name,
          targets.get(release.tag_name)!,
          release.name ?? '',
          rewriteReferences(release.body, numbers),
          author(release.author),
          release.prerelease ? 1 : 0,
          timestamp(release.created_at),
          timestamp(release.published_at ?? release.created_at),
          timestamp(release.published_at ?? release.created_at)
        )
      )
    );
  if (releases.length === perPage) return { step, cursor: row.cursor + 1, counts: { releases: importable.length } };
  await env.DB.prepare(
    'UPDATE releases SET latest=1 WHERE id=(SELECT id FROM releases WHERE repository_id=? AND draft=0 AND prerelease=0 ORDER BY published_at DESC LIMIT 1)'
  )
    .bind(row.repositoryId)
    .run();
  return { step: 'finished', cursor: 1, counts: { releases: importable.length } };
}
