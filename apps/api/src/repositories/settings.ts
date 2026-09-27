import { auditStatement } from '../core/audit';
import { requireFreshSession, type Principal } from '../auth/principal';
import { validBranchName, validIdentitySlug, validSlug, validVisibility } from '../core/domain';
import { requestGitGateway } from '../git/gateway';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import {
  deleteRepositoryBody,
  renameRepositoryBody,
  repositorySettingsBody,
  transferRepositoryBody
} from '../http/request-schemas';
import { authorizeRepository } from './access/access';

export async function getRepositorySettings(
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.maintain');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  const organizations = await env.DB.prepare(
    `SELECT organizations.slug,organizations.name FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? AND organization_members.role='owner' ORDER BY organizations.slug`
  )
    .bind(principal.id)
    .all<{ slug: string; name: string }>();
  const upstream = access.forkedFromRepositoryId
    ? await env.DB.prepare(
        'SELECT organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=?'
      )
        .bind(access.forkedFromRepositoryId)
        .first<{ owner: string; name: string }>()
    : null;
  return json({
    repository: { ...access, upstream },
    organizations: organizations.results
  });
}

export async function updateRepositorySettings(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, repositorySettingsBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  if (body.signingMode !== undefined && !(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before changing commit signing.');
  const description = body.description ?? access.description;
  const visibility = body.visibility ?? access.visibility;
  const defaultBranch = body.defaultBranch ?? access.defaultBranch;
  if (
    typeof description !== 'string' ||
    description.length > 280 ||
    !validVisibility(visibility) ||
    typeof defaultBranch !== 'string' ||
    !validBranchName(defaultBranch)
  )
    return problem(422, 'invalid_repository_settings', 'Repository settings are invalid.');
  if (defaultBranch !== access.defaultBranch) {
    const branch = await env.DB.prepare('SELECT 1 AS found FROM branches WHERE repository_id=? AND name=?')
      .bind(access.id, defaultBranch)
      .first();
    if (!branch) return problem(422, 'branch_not_found', 'The default branch must exist in this repository.');
  }
  const archivedAt =
    typeof body.archived === 'boolean' ? (body.archived ? new Date().toISOString() : null) : access.archivedAt;
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE repositories SET description=?,visibility=?,default_branch=?,archived_at=?,require_check_approval=COALESCE(?,require_check_approval),signing_mode=COALESCE(?,signing_mode),updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(
      description,
      visibility,
      defaultBranch,
      archivedAt,
      body.requireCheckApproval === undefined ? null : Number(body.requireCheckApproval),
      body.signingMode ?? null,
      access.id
    ),
    auditStatement(env, {
      organizationId: access.organizationId,
      repositoryId: access.id,
      actor: principal,
      action: 'repository.settings.updated',
      subjectType: 'repository',
      subjectId: access.id,
      details: {
        descriptionChanged: description !== access.description,
        visibility: { from: access.visibility, to: visibility },
        defaultBranch: { from: access.defaultBranch, to: defaultBranch },
        archived: Boolean(archivedAt),
        ...(body.signingMode === undefined ? {} : { signingMode: body.signingMode }),
        ...(body.requireCheckApproval === undefined ? {} : { requireCheckApproval: body.requireCheckApproval })
      }
    })
  ]);
  return json({
    repository: {
      ...access,
      description,
      visibility,
      defaultBranch,
      archivedAt
    }
  });
}

export async function renameRepository(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before renaming this repository.');
  const body = await readJson(request, renameRepositoryBody);
  if (!body || !validSlug(body.name))
    return problem(422, 'invalid_repository_name', 'Repository names must be URL-safe slugs.');
  const moved = await relocateStorage(env, owner, name, owner, body.name);
  if (!moved.ok)
    return problem(502, 'repository_storage_move_failed', 'Repository storage could not be renamed safely.');
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE repositories SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(
        body.name,
        access.id
      ),
      auditStatement(env, {
        organizationId: access.organizationId,
        repositoryId: access.id,
        actor: principal,
        action: 'repository.renamed',
        subjectType: 'repository',
        subjectId: access.id,
        details: { from: name, to: body.name }
      })
    ]);
  } catch (error) {
    await relocateStorage(env, owner, body.name, owner, name);
    if (String(error).toLowerCase().includes('unique'))
      return problem(409, 'repository_exists', 'A repository with this name already exists.');
    throw error;
  }
  return json({ repository: { owner, name: body.name } });
}

export async function transferRepository(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before transferring this repository.');
  const body = await readJson(request, transferRepositoryBody);
  if (!body || !validIdentitySlug(body.owner))
    return problem(422, 'invalid_owner', 'Choose a valid destination owner.');
  const destination = await env.DB.prepare(
    `SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.slug=? COLLATE NOCASE AND organization_members.user_id=? AND organization_members.role='owner'`
  )
    .bind(body.owner, principal.id)
    .first<{ id: string }>();
  if (!destination) return problem(403, 'destination_owner_required', 'You must own the destination organization.');
  const moved = await relocateStorage(env, owner, name, body.owner, name);
  if (!moved.ok)
    return problem(502, 'repository_storage_move_failed', 'Repository storage could not be transferred safely.');
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE repositories SET organization_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(
        destination.id,
        access.id
      ),
      auditStatement(env, {
        organizationId: access.organizationId,
        repositoryId: access.id,
        actor: principal,
        action: 'repository.transferred',
        subjectType: 'repository',
        subjectId: access.id,
        details: { from: owner, to: body.owner }
      })
    ]);
  } catch (error) {
    await relocateStorage(env, body.owner, name, owner, name);
    if (String(error).toLowerCase().includes('unique'))
      return problem(409, 'repository_exists', 'The destination already has a repository with this name.');
    throw error;
  }
  return json({ repository: { owner: body.owner, name } });
}

export async function scheduleRepositoryDeletion(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before deleting this repository.');
  const body = await readJson(request, deleteRepositoryBody);
  if (!body || body.confirmation !== `${owner}/${name}`)
    return problem(422, 'confirmation_mismatch', 'Type the full repository name to confirm deletion.');
  const deletionScheduledAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET deletion_scheduled_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(
      deletionScheduledAt,
      access.id
    ),
    env.DB.prepare(
      "UPDATE jobs SET state='canceled',cancel_requested=1,lease_token_hash=NULL,lease_expires_at=NULL,completed_at=CURRENT_TIMESTAMP WHERE run_id IN (SELECT id FROM runs WHERE repository_id=? OR checkout_repository_id=?) AND state IN ('queued','running')"
    ).bind(access.id, access.id),
    env.DB.prepare(
      "UPDATE runs SET state='canceled',cancellation_reason='developer',completed_at=CURRENT_TIMESTAMP WHERE (repository_id=? OR checkout_repository_id=?) AND state IN ('queued','running')"
    ).bind(access.id, access.id),
    auditStatement(env, {
      organizationId: access.organizationId,
      repositoryId: access.id,
      actor: principal,
      action: 'repository.deletion_scheduled',
      subjectType: 'repository',
      subjectId: access.id,
      details: { deletionScheduledAt }
    })
  ]);
  return json({ deletionScheduledAt });
}

function relocateStorage(env: Env, oldOwner: string, oldRepository: string, newOwner: string, newRepository: string) {
  return requestGitGateway(
    env,
    '/_marl/repositories/relocate',
    { oldOwner, oldRepository, newOwner, newRepository },
    { attempts: 2, timeoutMs: 30_000 }
  ).catch(() => new Response(null, { status: 502 }));
}
