import type { AbuseReport, ReportSubjectType } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import { identifier } from '../core/domain';
import type { Env } from '../core/platform';
import { json, problem, readJson } from '../http/http';
import { abuseReportBody, reportResolutionBody } from '../http/request-schemas';
import { disableRepository, isRemovable, removeContent, suspendUser } from './actions';
import { loadSubject, visibleSubject } from './subjects';

type ReportRow = Omit<AbuseReport, 'subject'> & { subjectId: string };

export async function createReport(request: Request, env: Env, principal: Principal) {
  const body = await readJson(request, abuseReportBody);
  if (!body) return problem(422, 'invalid_report', 'Choose what is wrong with this content.');
  const subject = await visibleSubject(env, principal, body.subjectType, body.subjectId);
  if (!subject) return problem(404, 'report_subject_not_found', 'The reported content no longer exists.');
  if (subject.authorId === principal.id && body.subjectType !== 'repository')
    return problem(422, 'own_content', 'You cannot report your own content.');
  await env.DB.prepare(
    'INSERT INTO abuse_reports (id,reporter_id,subject_type,subject_id,repository_id,reason,details) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING'
  )
    .bind(
      identifier('report'),
      principal.id,
      body.subjectType,
      subject.id,
      subject.repositoryId,
      body.reason,
      body.details.trim()
    )
    .run();
  return json({ reported: true }, { status: 201 });
}

export async function listReports(env: Env, principal: Principal, url: URL) {
  if (!principal.staff) return problem(404, 'not_found', 'The requested Marl API route does not exist.');
  const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
  const rows = await env.DB.prepare(
    `SELECT abuse_reports.id,subject_type AS subjectType,subject_id AS subjectId,reason,details,state,users.handle AS reporter,abuse_reports.created_at AS createdAt FROM abuse_reports JOIN users ON users.id=abuse_reports.reporter_id WHERE ${state === 'open' ? "state='open'" : "state<>'open'"} ORDER BY abuse_reports.created_at ${state === 'open' ? 'ASC' : 'DESC'} LIMIT 100`
  ).all<ReportRow>();
  const reports: AbuseReport[] = await Promise.all(
    rows.results.map(async ({ subjectId, ...report }) => {
      const subject = await loadSubject(env, report.subjectType, subjectId);
      const author = subject?.authorId
        ? await env.DB.prepare('SELECT handle FROM users WHERE id=?').bind(subject.authorId).first<{ handle: string }>()
        : null;
      return {
        ...report,
        subject: subject && {
          title: subject.title,
          excerpt: subject.excerpt.slice(0, 600),
          href: subject.href,
          author: author?.handle ?? null,
          repository: subject.repositoryId
        }
      };
    })
  );
  return json({ reports });
}

export async function resolveReport(request: Request, env: Env, principal: Principal, reportId: string) {
  if (!principal.staff || principal.authType !== 'session')
    return problem(404, 'not_found', 'The requested Marl API route does not exist.');
  const body = await readJson(request, reportResolutionBody);
  if (!body) return problem(422, 'invalid_resolution', 'Choose how to resolve this report.');
  const report = await env.DB.prepare(
    "SELECT subject_type AS subjectType,subject_id AS subjectId FROM abuse_reports WHERE id=? AND state='open'"
  )
    .bind(reportId)
    .first<{ subjectType: ReportSubjectType; subjectId: string }>();
  if (!report) return problem(404, 'report_not_found', 'This report has already been handled.');
  const subject = await loadSubject(env, report.subjectType, report.subjectId);
  const note = body.note.trim();
  if (body.action === 'remove_content') {
    if (!isRemovable(report.subjectType)) return problem(422, 'not_removable', 'Only comments can be removed.');
    await env.DB.batch(removeContent(env, principal, report.subjectType, report.subjectId));
  } else if (body.action === 'disable_repository') {
    if (!subject?.repositoryId) return problem(422, 'no_repository', 'This report is not about a repository.');
    await disableRepository(
      env,
      principal,
      subject.repositoryId,
      note || 'This repository violated the Acceptable Use Policy.'
    );
  } else if (body.action === 'suspend_user') {
    if (
      !subject?.authorId ||
      !(await suspendUser(env, principal, subject.authorId, note || 'Your account violated the Acceptable Use Policy.'))
    )
      return problem(422, 'not_suspendable', 'This account cannot be suspended.');
  }
  await env.DB.prepare(
    "UPDATE abuse_reports SET state=?,resolution=?,resolved_by=?,resolved_at=CURRENT_TIMESTAMP WHERE state='open' AND subject_type=? AND subject_id=?"
  )
    .bind(
      body.action === 'dismiss' ? 'dismissed' : 'actioned',
      note || body.action,
      principal.id,
      report.subjectType,
      report.subjectId
    )
    .run();
  return json({ resolved: true });
}
