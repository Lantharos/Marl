import { rewriteReferences, type GitHubUser } from '../github';
import { resolveAuthors } from '../people';
import { pageResult, pullNumbers, timestamp, type StepContext, type StepResult } from './context';

type Review = {
  id: number;
  user: GitHubUser;
  body: string | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  commit_id: string;
  submitted_at: string | null;
};
type ReviewComment = {
  id: number;
  in_reply_to_id?: number;
  pull_request_url: string;
  user: GitHubUser;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  side: 'LEFT' | 'RIGHT' | null;
  start_line: number | null;
  original_start_line: number | null;
  start_side: 'LEFT' | 'RIGHT' | null;
  commit_id: string;
  original_commit_id: string;
  created_at: string;
  updated_at: string;
};

const pullsPerStep = 25;
const concurrentRequests = 5;
const reviewStates: Partial<Record<Review['state'], string>> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  COMMENTED: 'commented'
};

function importable(review: Review) {
  return Boolean(
    review.submitted_at && reviewStates[review.state] && (review.state !== 'COMMENTED' || review.body?.trim())
  );
}

export async function importReviews(context: StepContext): Promise<StepResult> {
  const { env, row, github, importer, repositoryPath } = context;
  const pulls = await env.DB.prepare(
    'SELECT id,number FROM pull_requests WHERE repository_id=? AND number>=? ORDER BY number LIMIT ?'
  )
    .bind(row.repositoryId, row.cursor, pullsPerStep)
    .all<{ id: string; number: number }>();
  const reviews: Array<{ pullId: string; review: Review }> = [];
  for (let offset = 0; offset < pulls.results.length; offset += concurrentRequests) {
    const batch = pulls.results.slice(offset, offset + concurrentRequests);
    const pages = await Promise.all(
      batch.map((pull) => github<Review[]>(`${repositoryPath}/pulls/${pull.number}/reviews?per_page=100`))
    );
    batch.forEach((pull, index) =>
      reviews.push(...pages[index].filter(importable).map((review) => ({ pullId: pull.id, review })))
    );
  }
  const [author, numbers] = await Promise.all([
    resolveAuthors(
      env,
      reviews.map(({ review }) => review.user),
      importer
    ),
    pullNumbers(env, row.repositoryId)
  ]);
  if (reviews.length)
    await env.DB.batch(
      reviews.map(({ pullId, review }) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO pull_request_reviews (id,pull_request_id,author_id,state,body,commit_id,created_at) VALUES (?,?,?,?,?,?,?)'
        ).bind(
          `review_github_${review.id}`,
          pullId,
          author(review.user),
          reviewStates[review.state]!,
          rewriteReferences(review.body, numbers),
          review.commit_id,
          timestamp(review.submitted_at)
        )
      )
    );
  const counts = { reviews: reviews.length };
  if (pulls.results.length < pullsPerStep) return { step: context.next(), cursor: 1, counts };
  return { step: row.step, cursor: pulls.results.at(-1)!.number + 1, counts };
}

function side(value: ReviewComment['side']) {
  return value === 'LEFT' ? 'old' : 'new';
}

export async function importReviewComments(context: StepContext): Promise<StepResult> {
  const { env, row, github, importer, repositoryPath, page } = context;
  const comments = await github<ReviewComment[]>(`${repositoryPath}/pulls/comments?sort=created&direction=asc&${page}`);
  const [author, numbers] = await Promise.all([
    resolveAuthors(
      env,
      comments.map((comment) => comment.user),
      importer
    ),
    pullNumbers(env, row.repositoryId)
  ]);
  const statements = comments.flatMap((comment) => {
    const threadId = `thread_github_${comment.in_reply_to_id ?? comment.id}`;
    const reply = env.DB.prepare(
      'INSERT OR IGNORE INTO review_comments (id,thread_id,author_id,body,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM review_threads WHERE id=?)'
    ).bind(
      `reviewcomment_github_${comment.id}`,
      threadId,
      author(comment.user),
      rewriteReferences(comment.body, numbers),
      timestamp(comment.created_at),
      timestamp(comment.updated_at),
      threadId
    );
    if (comment.in_reply_to_id) return [reply];
    const current = comment.line !== null;
    const line = comment.line ?? comment.original_line;
    if (line === null) return [];
    const startLine = current ? comment.start_line : comment.original_start_line;
    return [
      env.DB.prepare(
        "INSERT OR IGNORE INTO review_threads (id,pull_request_id,path,side,line,start_side,start_line,commit_id,created_at,resolved_at) SELECT ?,id,?,?,?,?,?,?,?,CASE WHEN state IN ('merged','closed') THEN COALESCE(merged_at,updated_at) END FROM pull_requests WHERE repository_id=? AND number=?"
      ).bind(
        threadId,
        comment.path,
        side(comment.side),
        line,
        startLine === null ? null : side(comment.start_side),
        startLine,
        current ? comment.commit_id : comment.original_commit_id,
        timestamp(comment.created_at),
        row.repositoryId,
        Number(comment.pull_request_url.split('/').at(-1))
      ),
      reply
    ];
  });
  if (statements.length) await env.DB.batch(statements);
  return pageResult(context, comments.length, { reviewComments: comments.length });
}
