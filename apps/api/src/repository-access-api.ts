import type { Principal } from './auth';
import { requireFreshSession } from './auth';
import { auditStatement } from './audit';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { repositoryCollaboratorBody, repositoryTeamGrantBody } from './request-schemas';
import { authorizeRepository } from './repository-access';

export async function getRepositoryAccess(env: Env, principal: Principal, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const [collaborators, teams, availableMembers, availableTeams] = await Promise.all([
    env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl,repository_collaborators.role,repository_collaborators.created_at AS addedAt FROM repository_collaborators JOIN users ON users.id=repository_collaborators.user_id WHERE repository_collaborators.repository_id=? ORDER BY users.handle`).bind(repository.id).all(),
    env.DB.prepare(`SELECT teams.id,teams.slug,teams.name,repository_team_grants.role,COUNT(team_members.user_id) AS members FROM repository_team_grants JOIN teams ON teams.id=repository_team_grants.team_id LEFT JOIN team_members ON team_members.team_id=teams.id WHERE repository_team_grants.repository_id=? GROUP BY teams.id ORDER BY teams.name`).bind(repository.id).all(),
    env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl FROM users WHERE users.id!=? AND NOT EXISTS (SELECT 1 FROM repository_collaborators WHERE repository_collaborators.repository_id=? AND repository_collaborators.user_id=users.id) ORDER BY users.handle LIMIT 100`).bind(principal.id, repository.id).all(),
    env.DB.prepare(`SELECT id,slug,name FROM teams WHERE organization_id=? ORDER BY name`).bind(repository.organizationId).all()
  ]);
  return json({ repository: { id: repository.id, owner, name }, collaborators: collaborators.results, teams: teams.results, availableMembers: availableMembers.results, availableTeams: availableTeams.results });
}

export async function putRepositoryCollaborator(request: Request, env: Env, principal: Principal, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity as a repository administrator.');
  const body = await readJson(request, repositoryCollaboratorBody);
  if (!body || body.userId === principal.id) return problem(422, 'invalid_collaborator', 'Collaborator settings are invalid.');
  const user = await env.DB.prepare('SELECT id,handle FROM users WHERE id=?').bind(body.userId).first<{ id: string; handle: string }>();
  if (!user) return problem(404, 'user_not_found', 'User not found.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO repository_collaborators (repository_id,user_id,role,added_by) VALUES (?,?,?,?) ON CONFLICT(repository_id,user_id) DO UPDATE SET role=excluded.role,added_by=excluded.added_by').bind(repository.id, user.id, body.role, principal.id),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'repository.collaborator.updated', subjectType: 'user', subjectId: user.id, details: { role: body.role } })
  ]);
  return json({ collaborator: { id: user.id, handle: user.handle, role: body.role } });
}

export async function deleteRepositoryCollaborator(request: Request, env: Env, principal: Principal, owner: string, name: string, userId: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity as a repository administrator.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM repository_collaborators WHERE repository_id=? AND user_id=?').bind(repository.id, userId),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'repository.collaborator.removed', subjectType: 'user', subjectId: userId, details: {} })
  ]);
  return json({ removed: true });
}

export async function putRepositoryTeamGrant(request: Request, env: Env, principal: Principal, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity as a repository administrator.');
  const body = await readJson(request, repositoryTeamGrantBody);
  if (!body) return problem(422, 'invalid_team_grant', 'Team access settings are invalid.');
  const team = await env.DB.prepare('SELECT id,name FROM teams WHERE id=? AND organization_id=?').bind(body.teamId, repository.organizationId).first<{ id: string; name: string }>();
  if (!team) return problem(404, 'team_not_found', 'Team not found.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO repository_team_grants (repository_id,team_id,role,added_by) VALUES (?,?,?,?) ON CONFLICT(repository_id,team_id) DO UPDATE SET role=excluded.role,added_by=excluded.added_by').bind(repository.id, team.id, body.role, principal.id),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'repository.team_access.updated', subjectType: 'team', subjectId: team.id, details: { role: body.role } })
  ]);
  return json({ team: { id: team.id, name: team.name, role: body.role } });
}

export async function deleteRepositoryTeamGrant(request: Request, env: Env, principal: Principal, owner: string, name: string, teamId: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity as a repository administrator.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM repository_team_grants WHERE repository_id=? AND team_id=?').bind(repository.id, teamId),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'repository.team_access.removed', subjectType: 'team', subjectId: teamId, details: {} })
  ]);
  return json({ removed: true });
}
