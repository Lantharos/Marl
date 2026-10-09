import type { Principal } from '../auth/principal';
import type { Env } from '../core/platform';
import { json, problem, readJson } from '../http/http';
import { abuseReportBody } from '../http/request-schemas';
import { route } from '../http/router';
import { authorizeRepositoryId } from '../repositories/access/access';
import { backoffice } from './client';
import { reports, type subjectTypes } from './reports.pult';

type SubjectType = (typeof subjectTypes)[number];

type Subject = {
  id: string;
  title: string;
  excerpt: string;
  path: string;
  authorId: string | null;
  author: string | null;
  repositoryId: string | null;
  repository: string | null;
};

const repositoryName = (column: string) =>
  `(SELECT organizations.slug || '/' || repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=${column})`;

const subjectQueries: Record<SubjectType, string> = {
  repository: `SELECT id,${repositoryName('repositories.id')} AS title,description AS excerpt,'/' || ${repositoryName('repositories.id')} AS path,NULL AS authorId,NULL AS author,id AS repositoryId,${repositoryName('repositories.id')} AS repository FROM repositories WHERE id=?`,
  issue: `SELECT issues.id,issues.title,issues.body AS excerpt,'/' || ${repositoryName('issues.repository_id')} || '/issues/' || issues.number AS path,users.id AS authorId,users.handle AS author,issues.repository_id AS repositoryId,${repositoryName('issues.repository_id')} AS repository FROM issues JOIN users ON users.id=issues.author_id WHERE issues.id=?`,
  pull: `SELECT pull_requests.id,pull_requests.title,pull_requests.body AS excerpt,'/' || ${repositoryName('pull_requests.repository_id')} || '/pulls/' || pull_requests.number AS path,users.id AS authorId,users.handle AS author,pull_requests.repository_id AS repositoryId,${repositoryName('pull_requests.repository_id')} AS repository FROM pull_requests JOIN users ON users.id=pull_requests.author_id WHERE pull_requests.id=?`,
  issue_comment: `SELECT issue_comments.id,'Comment on ' || issues.title AS title,issue_comments.body AS excerpt,'/' || ${repositoryName('issues.repository_id')} || '/issues/' || issues.number || '#comment-' || issue_comments.id AS path,users.id AS authorId,users.handle AS author,issues.repository_id AS repositoryId,${repositoryName('issues.repository_id')} AS repository FROM issue_comments JOIN issues ON issues.id=issue_comments.issue_id JOIN users ON users.id=issue_comments.author_id WHERE issue_comments.id=? AND issue_comments.deleted_at IS NULL`,
  pull_comment: `SELECT pull_request_comments.id,'Comment on ' || pull_requests.title AS title,pull_request_comments.body AS excerpt,'/' || ${repositoryName('pull_requests.repository_id')} || '/pulls/' || pull_requests.number AS path,users.id AS authorId,users.handle AS author,pull_requests.repository_id AS repositoryId,${repositoryName('pull_requests.repository_id')} AS repository FROM pull_request_comments JOIN pull_requests ON pull_requests.id=pull_request_comments.pull_request_id JOIN users ON users.id=pull_request_comments.author_id WHERE pull_request_comments.id=? AND pull_request_comments.deleted_at IS NULL`,
  review_comment: `SELECT review_comments.id,'Review comment on ' || pull_requests.title AS title,review_comments.body AS excerpt,'/' || ${repositoryName('pull_requests.repository_id')} || '/pulls/' || pull_requests.number AS path,users.id AS authorId,users.handle AS author,pull_requests.repository_id AS repositoryId,${repositoryName('pull_requests.repository_id')} AS repository FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id JOIN users ON users.id=review_comments.author_id WHERE review_comments.id=? AND review_comments.deleted_at IS NULL`,
  user: `SELECT id,'@' || handle AS title,bio AS excerpt,'/' || handle AS path,id AS authorId,handle AS author,NULL AS repositoryId,NULL AS repository FROM users WHERE (id=?1 OR handle=?1 COLLATE NOCASE) AND deleted_at IS NULL`
};

async function visibleSubject(env: Env, principal: Principal, type: SubjectType, id: string) {
  const subject = await env.DB.prepare(subjectQueries[type]).bind(id).first<Subject>();
  if (!subject) return null;
  if (subject.repositoryId && !(await authorizeRepositoryId(env, principal, subject.repositoryId, 'repository.read')))
    return null;
  return subject;
}

async function createReport(request: Request, env: Env, principal: Principal) {
  const body = await readJson(request, abuseReportBody);
  if (!body) return problem(422, 'invalid_report', 'Choose what is wrong with this content.');
  const subject = await visibleSubject(env, principal, body.subjectType, body.subjectId);
  if (!subject) return problem(404, 'report_subject_not_found', 'The reported content no longer exists.');
  if (subject.authorId === principal.id && body.subjectType !== 'repository')
    return problem(422, 'own_content', 'You cannot report your own content.');
  try {
    await backoffice().send(reports, {
      fingerprint: `${body.subjectType}:${subject.id}`,
      data: {
        subject: {
          type: body.subjectType,
          id: subject.id,
          title: subject.title,
          url: `${env.PUBLIC_URL}${subject.path}`,
          excerpt: subject.excerpt.slice(0, 5000)
        },
        reason: body.reason,
        details: body.details.trim(),
        reporter: { id: principal.id, handle: principal.handle },
        author: subject.authorId && subject.author ? { id: subject.authorId, handle: subject.author } : null,
        repository:
          subject.repositoryId && subject.repository ? { id: subject.repositoryId, name: subject.repository } : null
      }
    });
  } catch (error) {
    console.error('A report could not be sent to Pult.', error);
    return problem(503, 'reports_unavailable', 'Reports can’t be sent right now. Try again in a few minutes.');
  }
  return json({ reported: true }, { status: 201 });
}

export const reportingRoutes = [
  route('POST', '/reports', 'user', ({ request, env, principal }) => createReport(request, env, principal))
];
