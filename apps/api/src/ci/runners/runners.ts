import type { Principal } from '../../auth/principal';
import { requireFreshSession, sha256 } from '../../auth/principal';
import { identifier, validSlug } from '../../core/domain';
import { json, problem, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { runnerEnrollmentBody, runnerRegistrationBody } from '../../http/request-schemas';

export type Runner = {
  id: string;
  organizationId: string;
  name: string;
  labelsJson: string;
  concurrency: number;
  platform: string;
  architecture: string;
  version: string;
};

const runnerSelect = `SELECT runners.id,runners.name,runners.labels_json AS labelsJson,runners.active_jobs AS activeJobs,runners.concurrency,runners.platform,runners.architecture,runners.version,runners.last_seen_at AS lastSeenAt,CASE WHEN runners.disabled_at IS NOT NULL OR runners.last_seen_at < datetime('now','-90 seconds') THEN 'offline' WHEN runners.active_jobs > 0 THEN 'busy' ELSE 'idle' END AS state FROM runners JOIN organization_members ON organization_members.organization_id=runners.organization_id`;

export const checkForJobSql = `id=(SELECT job_checks.id FROM checks AS job_checks JOIN jobs ON jobs.id=? JOIN runs ON runs.id=jobs.run_id WHERE job_checks.repository_id=COALESCE(runs.checkout_repository_id,runs.repository_id) AND job_checks.commit_id=runs.commit_id AND job_checks.producer_repository_id=runs.repository_id AND job_checks.producer_workflow_id=runs.workflow_id AND job_checks.producer_job_key=jobs.job_key)`;

function bearer(request: Request): string | null {
  const value = request.headers.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
}

export function hasRunnerCredential(request: Request) {
  return bearer(request)?.startsWith('marl_runner_') === true;
}

function cleanLabels(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const labels = [...new Set(value.map(String).map((label) => label.trim().toLowerCase()))];
  return labels.every((label) => /^[a-z0-9][a-z0-9._-]{0,39}$/.test(label)) ? labels : null;
}

export async function authenticateRunner(request: Request, env: Env): Promise<Runner | null> {
  const token = bearer(request);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT id, organization_id AS organizationId, name, labels_json AS labelsJson, concurrency, platform, architecture, version FROM runners WHERE token_hash = ? AND disabled_at IS NULL`
  )
    .bind(await sha256(token))
    .first<Runner>();
}

export async function createEnrollment(request: Request, env: Env, principal: Principal): Promise<Response> {
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before connecting a runner.');
  const body = await readJson(request, runnerEnrollmentBody);
  if (!body || typeof body.organization !== 'string')
    return problem(422, 'organization_required', 'Choose an organization for this runner.');
  const organization = await env.DB.prepare(
    `SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id = organizations.id WHERE organizations.slug = ? COLLATE NOCASE AND organization_members.user_id = ? AND organization_members.role IN ('owner','admin')`
  )
    .bind(body.organization, principal.id)
    .first<{ id: string }>();
  if (!organization) return problem(403, 'admin_required', 'Only organization administrators can connect runners.');
  const token = `marl_enroll_${crypto.randomUUID().replaceAll('-', '')}`;
  const minutes = Math.min(Math.max(Number(body.expiresMinutes) || 15, 5), 60);
  const id = identifier('enrollment');
  await env.DB.prepare(
    `INSERT INTO runner_enrollment_tokens (id, organization_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?, datetime('now', ?))`
  )
    .bind(id, organization.id, await sha256(token), principal.id, `+${minutes} minutes`)
    .run();
  return json(
    { enrollment: { id, token, expiresAt: new Date(Date.now() + minutes * 60_000).toISOString() } },
    { status: 201 }
  );
}

export async function registerRunner(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, runnerRegistrationBody);
  const labels = cleanLabels(body?.labels);
  if (
    !body ||
    typeof body.enrollmentToken !== 'string' ||
    !validSlug(body.name) ||
    !labels ||
    typeof body.platform !== 'string' ||
    typeof body.architecture !== 'string' ||
    typeof body.version !== 'string'
  )
    return problem(
      422,
      'invalid_runner',
      'Runner name, platform, architecture, version, and valid labels are required.'
    );
  const enrollment = await env.DB.prepare(
    `SELECT id, organization_id AS organizationId FROM runner_enrollment_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
  )
    .bind(await sha256(body.enrollmentToken))
    .first<{ id: string; organizationId: string }>();
  if (!enrollment)
    return problem(401, 'invalid_enrollment', 'This runner enrollment token is invalid, expired, or already used.');
  const concurrency = Math.min(Math.max(Number(body.concurrency) || 1, 1), 32);
  const id = identifier('runner');
  const token = `marl_runner_${crypto.randomUUID().replaceAll('-', '')}`;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO runners (id, organization_id, name, token_hash, labels_json, concurrency, platform, architecture, version, enrollment_id) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, id FROM runner_enrollment_tokens WHERE id = ? AND used_at IS NULL'
      ).bind(
        id,
        enrollment.organizationId,
        body.name,
        await sha256(token),
        JSON.stringify(labels),
        concurrency,
        body.platform.slice(0, 80),
        body.architecture.slice(0, 80),
        body.version.slice(0, 40),
        enrollment.id
      ),
      env.DB.prepare(
        'UPDATE runner_enrollment_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL'
      ).bind(enrollment.id)
    ]);
    if (results[0]?.meta?.changes !== 1)
      return problem(401, 'invalid_enrollment', 'This runner enrollment token is invalid, expired, or already used.');
  } catch (error) {
    if (String(error).toLowerCase().includes('unique'))
      return problem(409, 'runner_exists', 'A runner with this name already exists.');
    throw error;
  }
  return json({ runner: { id, name: body.name, labels, concurrency }, token }, { status: 201 });
}

export async function listRunners(env: Env, principal: Principal): Promise<Response> {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Runners can only be managed from a browser session.');
  const rows = await env.DB.prepare(`${runnerSelect} WHERE organization_members.user_id=? ORDER BY state,runners.name`)
    .bind(principal.id)
    .all<{
      id: string;
      name: string;
      labelsJson: string;
      activeJobs: number;
      concurrency: number;
      platform: string;
      architecture: string;
      version: string;
      lastSeenAt: string;
      state: string;
    }>();
  return json({
    runners: rows.results.map(({ labelsJson, ...runner }) => ({ ...runner, labels: JSON.parse(labelsJson) }))
  });
}

export async function getRunner(env: Env, principal: Principal, id: string): Promise<Response> {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Runners can only be managed from a browser session.');
  const row = await env.DB.prepare(`${runnerSelect} WHERE organization_members.user_id=? AND runners.id=?`)
    .bind(principal.id, id)
    .first<{
      id: string;
      name: string;
      labelsJson: string;
      activeJobs: number;
      concurrency: number;
      platform: string;
      architecture: string;
      version: string;
      lastSeenAt: string;
      state: string;
    }>();
  if (!row) return problem(404, 'runner_not_found', 'Runner not found.');
  const { labelsJson, ...runner } = row;
  return json({ runner: { ...runner, labels: JSON.parse(labelsJson) } });
}

export async function heartbeatRunner(env: Env, runner: Runner): Promise<Response> {
  await env.DB.prepare(
    `UPDATE runners SET last_seen_at=CURRENT_TIMESTAMP, active_jobs=(SELECT COUNT(*) FROM jobs WHERE runner_id=? AND state='running') WHERE id=?`
  )
    .bind(runner.id, runner.id)
    .run();
  const canceled = await env.DB.prepare(
    `SELECT id FROM jobs WHERE runner_id=? AND state='running' AND cancel_requested=1`
  )
    .bind(runner.id)
    .all<{ id: string }>();
  return json({ cancelJobIds: canceled.results.map((job) => job.id) });
}

export async function authorizeRunnerGit(env: Env, runner: Runner, owner: string, name: string): Promise<Response> {
  const allowed = await env.DB.prepare(
    `SELECT repositories.id, repositories.visibility FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE organizations.slug=? COLLATE NOCASE AND repositories.name=? COLLATE NOCASE AND (repositories.organization_id=? OR EXISTS (SELECT 1 FROM jobs JOIN runs ON runs.id=jobs.run_id JOIN repositories AS producer ON producer.id=runs.repository_id WHERE runs.checkout_repository_id=repositories.id AND producer.organization_id=? AND jobs.runner_id=? AND jobs.state='running' AND jobs.lease_expires_at>CURRENT_TIMESTAMP))`
  )
    .bind(owner, name, runner.organizationId, runner.organizationId, runner.id)
    .first<{ id: string; visibility: string }>();
  return allowed
    ? json({ repositoryId: allowed.id, visibility: allowed.visibility, read: true, write: false })
    : problem(403, 'git_access_denied', 'This runner cannot read the repository.');
}
