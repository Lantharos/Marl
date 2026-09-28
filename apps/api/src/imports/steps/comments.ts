import { rewriteReferences, type GitHubUser } from '../github';
import { resolveAuthors } from '../people';
import { pageResult, pullNumbers, timestamp, type StepContext, type StepResult } from './context';

type Comment = {
  id: number;
  body: string;
  user: GitHubUser;
  issue_url: string;
  created_at: string;
  updated_at: string;
};

export async function importComments(context: StepContext): Promise<StepResult> {
  const { env, row, github, importer, repositoryPath, page } = context;
  const comments = await github<Comment[]>(`${repositoryPath}/issues/comments?sort=created&direction=asc&${page}`);
  const [author, numbers] = await Promise.all([
    resolveAuthors(
      env,
      comments.map((comment) => comment.user),
      importer
    ),
    pullNumbers(env, row.repositoryId)
  ]);
  const statements = comments.map((comment) => {
    const number = Number(comment.issue_url.split('/').at(-1));
    const values = [
      `comment_github_${comment.id}`,
      author(comment.user),
      rewriteReferences(comment.body, numbers),
      timestamp(comment.created_at),
      timestamp(comment.updated_at),
      row.repositoryId,
      number
    ];
    return numbers.has(number)
      ? env.DB.prepare(
          'INSERT OR IGNORE INTO pull_request_comments (id,pull_request_id,author_id,body,created_at,updated_at) SELECT ?,id,?,?,?,? FROM pull_requests WHERE repository_id=? AND number=?'
        ).bind(...values)
      : env.DB.prepare(
          'INSERT OR IGNORE INTO issue_comments (id,issue_id,author_id,body,created_at,updated_at) SELECT ?,id,?,?,?,? FROM issues WHERE repository_id=? AND number=?'
        ).bind(...values);
  });
  if (statements.length) await env.DB.batch(statements);
  return pageResult(context, comments.length, { comments: comments.length });
}
