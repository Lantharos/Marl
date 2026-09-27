import { auditStatement } from '../core/audit';
import { requireFreshSession, type Principal } from '../auth/principal';
import { identifier, validIdentitySlug, validSlug } from '../core/domain';
import { requestGitGateway } from '../git/gateway';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import { forkRepositoryBody } from '../http/request-schemas';
import { authorizeRepository } from './access/access';

export async function forkRepository(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Repositories must be forked from a browser session.');
  const source = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!source) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, forkRepositoryBody);
  if (!body || !validIdentitySlug(body.owner) || !validSlug(body.name))
    return problem(422, 'invalid_repository_name', 'Owner and repository names must be URL-safe slugs.');
  const destination = await env.DB.prepare(
    `SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.slug=? COLLATE NOCASE AND organization_members.user_id=? AND organization_members.role IN ('owner','admin')`
  )
    .bind(body.owner, principal.id)
    .first<{ id: string }>();
  if (!destination) return problem(403, 'owner_required', 'You cannot create repositories for this owner.');
  const rootId = source.forkRootRepositoryId ?? source.id;
  const existingFork = await env.DB.prepare(
    `SELECT organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.organization_id=? AND COALESCE(repositories.fork_root_repository_id,repositories.id)=? AND repositories.deletion_scheduled_at IS NULL`
  )
    .bind(destination.id, rootId)
    .first<{ owner: string; name: string }>();
  if (existingFork)
    return problem(
      409,
      'fork_exists',
      `This organization already has the fork ${existingFork.owner}/${existingFork.name}.`
    );
  const id = identifier('repo');
  const defaults = [
    ['bug', '#e16f73', 'Something is not working'],
    ['enhancement', '#8c7ad8', 'New or improved functionality'],
    ['documentation', '#68a7b8', 'Documentation changes'],
    ['needs review', '#d3a45f', 'Ready for reviewer attention']
  ];
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO repositories (id,organization_id,name,description,visibility,default_branch,created_by,forked_from_repository_id,fork_root_repository_id) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(
        id,
        destination.id,
        body.name,
        source.description,
        source.visibility,
        source.defaultBranch,
        principal.id,
        source.id,
        rootId
      ),
      ...defaults.map(([label, color, detail]) =>
        env.DB.prepare(
          'INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?)'
        ).bind(identifier('label'), id, label, color, detail)
      ),
      auditStatement(env, {
        organizationId: destination.id,
        repositoryId: id,
        actor: principal,
        action: 'repository.forked',
        subjectType: 'repository',
        subjectId: id,
        details: { source: `${owner}/${name}` }
      })
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique'))
      return problem(409, 'repository_exists', 'A repository with this name already exists.');
    throw error;
  }
  const copied = await requestGitGateway(
    env,
    '/_marl/repositories/fork',
    {
      repositoryId: id,
      sourceRepositoryId: source.id,
      sourceOwner: owner,
      sourceRepository: name,
      destinationOrganizationId: destination.id,
      destinationOwner: body.owner,
      destinationRepository: body.name,
      actorId: principal.id
    },
    { attempts: 2, timeoutMs: 120_000 }
  ).catch(() => new Response(null, { status: 502 }));
  if (!copied.ok) {
    await env.DB.prepare('DELETE FROM repositories WHERE id=?').bind(id).run();
    return problem(502, 'repository_fork_failed', 'Repository storage could not be forked safely.');
  }
  return json(
    {
      repository: {
        id,
        owner: body.owner,
        name: body.name,
        description: source.description,
        iconUrl: null,
        visibility: source.visibility,
        defaultBranch: source.defaultBranch,
        upstream: { owner, name },
        starred: false,
        starCount: 0,
        forkCount: 0,
        updatedAt: new Date().toISOString()
      }
    },
    { status: 201 }
  );
}

export async function detachRepositoryFork(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!repository.forkedFromRepositoryId)
    return problem(409, 'not_a_fork', 'This repository is not part of a fork network.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before detaching this fork.');
  await env.DB.batch([
    env.DB.prepare(
      `WITH RECURSIVE descendants(id) AS (SELECT ? UNION ALL SELECT repositories.id FROM repositories JOIN descendants ON repositories.forked_from_repository_id=descendants.id) UPDATE repositories SET fork_root_repository_id=? WHERE id IN (SELECT id FROM descendants)`
    ).bind(repository.id, repository.id),
    env.DB.prepare(
      'UPDATE repositories SET forked_from_repository_id=NULL,fork_root_repository_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(repository.id),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: 'repository.fork.detached',
      subjectType: 'repository',
      subjectId: repository.id
    })
  ]);
  return json({ detached: true });
}
