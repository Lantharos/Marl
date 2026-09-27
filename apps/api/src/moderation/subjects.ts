import type { ReportSubjectType } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import type { Env } from '../core/platform';
import { authorizeRepositoryId } from '../repositories/access/access';

export type ReportSubject = {
  id: string;
  repositoryId: string | null;
  authorId: string | null;
  title: string;
  excerpt: string;
  href: string;
};

const repositoryPath = `(SELECT organizations.slug || '/' || repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=%)`;
const path = (column: string) => repositoryPath.replace('%', column);

const subjectQueries: Record<ReportSubjectType, string> = {
  repository: `SELECT id,id AS repositoryId,NULL AS authorId,${path('repositories.id')} AS title,description AS excerpt,'/' || ${path('repositories.id')} AS href FROM repositories WHERE id=?`,
  issue: `SELECT id,repository_id AS repositoryId,author_id AS authorId,title,body AS excerpt,'/' || ${path('issues.repository_id')} || '/issues/' || number AS href FROM issues WHERE id=?`,
  pull: `SELECT id,repository_id AS repositoryId,author_id AS authorId,title,body AS excerpt,'/' || ${path('pull_requests.repository_id')} || '/pulls/' || number AS href FROM pull_requests WHERE id=?`,
  issue_comment: `SELECT issue_comments.id,issues.repository_id AS repositoryId,issue_comments.author_id AS authorId,'Comment on ' || issues.title AS title,issue_comments.body AS excerpt,'/' || ${path('issues.repository_id')} || '/issues/' || issues.number || '#comment-' || issue_comments.id AS href FROM issue_comments JOIN issues ON issues.id=issue_comments.issue_id WHERE issue_comments.id=? AND issue_comments.deleted_at IS NULL`,
  pull_comment: `SELECT pull_request_comments.id,pull_requests.repository_id AS repositoryId,pull_request_comments.author_id AS authorId,'Comment on ' || pull_requests.title AS title,pull_request_comments.body AS excerpt,'/' || ${path('pull_requests.repository_id')} || '/pulls/' || pull_requests.number AS href FROM pull_request_comments JOIN pull_requests ON pull_requests.id=pull_request_comments.pull_request_id WHERE pull_request_comments.id=? AND pull_request_comments.deleted_at IS NULL`,
  review_comment: `SELECT review_comments.id,pull_requests.repository_id AS repositoryId,review_comments.author_id AS authorId,'Review comment on ' || pull_requests.title AS title,review_comments.body AS excerpt,'/' || ${path('pull_requests.repository_id')} || '/pulls/' || pull_requests.number AS href FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id WHERE review_comments.id=? AND review_comments.deleted_at IS NULL`,
  user: `SELECT id,NULL AS repositoryId,id AS authorId,display_name || ' (@' || handle || ')' AS title,bio AS excerpt,'/' || handle AS href FROM users WHERE (id=?1 OR handle=?1 COLLATE NOCASE) AND deleted_at IS NULL`
};

export function loadSubject(env: Env, type: ReportSubjectType, id: string) {
  return env.DB.prepare(subjectQueries[type]).bind(id).first<ReportSubject>();
}

export async function visibleSubject(env: Env, principal: Principal, type: ReportSubjectType, id: string) {
  const subject = await loadSubject(env, type, id);
  if (!subject) return null;
  if (subject.repositoryId && !(await authorizeRepositoryId(env, principal, subject.repositoryId, 'repository.read')))
    return null;
  return subject;
}
