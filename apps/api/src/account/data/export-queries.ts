import type { Env } from '../../core/platform';

const pageSize = 200;

export async function* paged<T extends { id: string }>(env: Env, sql: string, values: unknown[]) {
  let after = '';
  while (true) {
    const rows = await env.DB.prepare(`SELECT * FROM (${sql}) WHERE id>? ORDER BY id LIMIT ${pageSize}`)
      .bind(...values, after)
      .all<T>();
    yield* rows.results;
    if (rows.results.length < pageSize) return;
    after = rows.results.at(-1)!.id;
  }
}

const author = (column: string) => `(SELECT handle FROM users WHERE users.id=${column}) AS author`;

export const exportQueries = {
  ownedRepositories: `SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.description,repositories.visibility,repositories.default_branch AS defaultBranch,repositories.archived_at AS archivedAt,repositories.created_at AS createdAt FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? AND organization_members.role='owner' AND repositories.deletion_scheduled_at IS NULL`,
  labels: `SELECT id,name,color,description FROM repository_labels WHERE repository_id=?`,
  issues: `SELECT id,number,title,body,state,${author('author_id')},created_at AS createdAt,closed_at AS closedAt,(SELECT json_group_array(repository_labels.name) FROM issue_labels JOIN repository_labels ON repository_labels.id=issue_labels.label_id WHERE issue_labels.issue_id=issues.id) AS labels FROM issues WHERE repository_id=?`,
  issueComments: `SELECT id,${author('author_id')},body,created_at AS createdAt,updated_at AS updatedAt FROM issue_comments WHERE issue_id=? AND deleted_at IS NULL`,
  pulls: `SELECT id,number,title,body,state,${author('author_id')},source_branch AS sourceBranch,target_branch AS targetBranch,source_commit_id AS sourceCommitId,merged_commit_id AS mergedCommitId,merge_method AS mergeMethod,created_at AS createdAt,merged_at AS mergedAt FROM pull_requests WHERE repository_id=?`,
  pullComments: `SELECT id,${author('author_id')},body,created_at AS createdAt FROM pull_request_comments WHERE pull_request_id=? AND deleted_at IS NULL`,
  reviews: `SELECT id,${author('author_id')},state,body,commit_id AS commitId,created_at AS createdAt FROM pull_request_reviews WHERE pull_request_id=?`,
  threads: `SELECT id,path,side,start_line AS startLine,line,commit_id AS commitId,resolved_at AS resolvedAt,(SELECT json_group_array(json_object('author',(SELECT handle FROM users WHERE users.id=review_comments.author_id),'body',review_comments.body,'createdAt',review_comments.created_at)) FROM review_comments WHERE review_comments.thread_id=review_threads.id AND review_comments.deleted_at IS NULL) AS comments FROM review_threads WHERE pull_request_id=?`,
  releases: `SELECT id,tag_name AS tagName,name,body,target_commit_id AS targetCommitId,draft,prerelease,published_at AS publishedAt,(SELECT json_group_array(json_object('name',name,'byteSize',byte_size,'contentType',content_type,'id',id)) FROM release_assets WHERE release_assets.release_id=releases.id) AS assets FROM releases WHERE repository_id=?`,
  authoredIssues: `SELECT issues.id,organizations.slug || '/' || repositories.name AS repository,issues.number,issues.title,issues.body,issues.created_at AS createdAt FROM issues JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE issues.author_id=?`,
  authoredIssueComments: `SELECT issue_comments.id,organizations.slug || '/' || repositories.name AS repository,issues.number,issue_comments.body,issue_comments.created_at AS createdAt FROM issue_comments JOIN issues ON issues.id=issue_comments.issue_id JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE issue_comments.author_id=? AND issue_comments.deleted_at IS NULL`,
  authoredPulls: `SELECT pull_requests.id,organizations.slug || '/' || repositories.name AS repository,pull_requests.number,pull_requests.title,pull_requests.body,pull_requests.created_at AS createdAt FROM pull_requests JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE pull_requests.author_id=?`,
  authoredPullComments: `SELECT pull_request_comments.id,organizations.slug || '/' || repositories.name AS repository,pull_requests.number,pull_request_comments.body,pull_request_comments.created_at AS createdAt FROM pull_request_comments JOIN pull_requests ON pull_requests.id=pull_request_comments.pull_request_id JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE pull_request_comments.author_id=? AND pull_request_comments.deleted_at IS NULL`,
  authoredReviews: `SELECT pull_request_reviews.id,organizations.slug || '/' || repositories.name AS repository,pull_requests.number,pull_request_reviews.state,pull_request_reviews.body,pull_request_reviews.created_at AS createdAt FROM pull_request_reviews JOIN pull_requests ON pull_requests.id=pull_request_reviews.pull_request_id JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE pull_request_reviews.author_id=?`,
  authoredReviewComments: `SELECT review_comments.id,organizations.slug || '/' || repositories.name AS repository,pull_requests.number,review_threads.path,review_threads.line,review_comments.body,review_comments.created_at AS createdAt FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE review_comments.author_id=? AND review_comments.deleted_at IS NULL`
};
