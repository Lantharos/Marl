import type { Principal } from './auth';
import { createPersonalAccessToken, listPersonalAccessTokens, revokePersonalAccessToken } from './developer-tokens';
import { acceptOrganizationInvitation, addTeamMember, createOrganization, createTeam, deleteTeam, getOrganization, getOrganizationAccess, inviteOrganizationMember, listOrganizations, readOrganizationAvatar, removeOrganizationMember, removeTeamMember, revokeOrganizationInvitation, updateOrganization, updateOrganizationMember, uploadOrganizationAvatar } from './organizations';
import type { Env } from './platform';
import { getProfile, listSessions, readAvatar, updateProfile, uploadAvatar } from './profile';
import { deleteRepositoryCollaborator, deleteRepositoryTeamGrant, getRepositoryAccess, putRepositoryCollaborator, putRepositoryTeamGrant } from './repository-access-api';

export async function handleAccessRoute(request: Request, env: Env, principal: Principal, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/v1/profile') {
    if (request.method === 'GET') return getProfile(env, principal);
    if (request.method === 'PATCH') return updateProfile(request, env, principal);
  }
  if (url.pathname === '/api/v1/profile/avatar' && request.method === 'PUT') return uploadAvatar(request, env, principal);
  if (url.pathname === '/api/v1/sessions' && request.method === 'GET') return listSessions(env, principal);
  const avatar = url.pathname.match(/^\/api\/v1\/avatars\/([^/]+)\/([^/]+)$/);
  if (avatar && request.method === 'GET') return readAvatar(env, avatar[1], avatar[2]);
  const organizationAvatarAsset = url.pathname.match(/^\/api\/v1\/organization-avatars\/([^/]+)\/([^/]+)$/);
  if (organizationAvatarAsset && request.method === 'GET') return readOrganizationAvatar(env, organizationAvatarAsset[1], organizationAvatarAsset[2]);

  if (url.pathname === '/api/v1/organizations') {
    if (request.method === 'GET') return listOrganizations(env, principal);
    if (request.method === 'POST') return createOrganization(request, env, principal);
  }

  const organizationSettings = url.pathname.match(/^\/api\/v1\/organizations\/([^/]+)$/);
  if (organizationSettings) {
    const slug = decodeURIComponent(organizationSettings[1]);
    if (request.method === 'GET') return getOrganization(env, principal, slug);
    if (request.method === 'PATCH') return updateOrganization(request, env, principal, slug);
  }
  const organizationAvatar = url.pathname.match(/^\/api\/v1\/organizations\/([^/]+)\/avatar$/);
  if (organizationAvatar && request.method === 'PUT') return uploadOrganizationAvatar(request, env, principal, decodeURIComponent(organizationAvatar[1]));

  const invitationAccept = url.pathname.match(/^\/api\/v1\/invitations\/([^/]+)\/accept$/);
  if (invitationAccept && request.method === 'POST') return acceptOrganizationInvitation(request, env, principal, invitationAccept[1]);

  const organizationAccess = url.pathname.match(/^\/api\/v1\/organizations\/([^/]+)\/access(?:\/(invitations|members|teams)(?:\/([^/]+))?(?:\/members(?:\/([^/]+))?)?)?$/);
  if (organizationAccess) {
    const slug = decodeURIComponent(organizationAccess[1]);
    const kind = organizationAccess[2];
    const subject = organizationAccess[3];
    const teamMember = organizationAccess[4];
    if (!kind && request.method === 'GET') return getOrganizationAccess(env, principal, slug);
    if (kind === 'invitations' && !subject && request.method === 'POST') return inviteOrganizationMember(request, env, principal, slug);
    if (kind === 'invitations' && subject && request.method === 'DELETE') return revokeOrganizationInvitation(request, env, principal, slug, subject);
    if (kind === 'members' && subject && request.method === 'PATCH') return updateOrganizationMember(request, env, principal, slug, subject);
    if (kind === 'members' && subject && request.method === 'DELETE') return removeOrganizationMember(request, env, principal, slug, subject);
    if (kind === 'teams' && !subject && request.method === 'POST') return createTeam(request, env, principal, slug);
    if (kind === 'teams' && subject && !teamMember && url.pathname.endsWith('/members') && request.method === 'POST') return addTeamMember(request, env, principal, slug, subject);
    if (kind === 'teams' && subject && teamMember && request.method === 'DELETE') return removeTeamMember(request, env, principal, slug, subject, teamMember);
    if (kind === 'teams' && subject && !teamMember && request.method === 'DELETE') return deleteTeam(request, env, principal, slug, subject);
  }

  if (url.pathname === '/api/v1/tokens') {
    if (request.method === 'GET') return listPersonalAccessTokens(env, principal);
    if (request.method === 'POST') return createPersonalAccessToken(request, env, principal);
  }
  const token = url.pathname.match(/^\/api\/v1\/tokens\/(token_[a-z0-9]+)$/);
  if (token && request.method === 'DELETE') return revokePersonalAccessToken(request, env, principal, token[1]);

  const repositoryAccess = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/access(?:\/(collaborators|teams)(?:\/([^/]+))?)?$/);
  if (!repositoryAccess) return null;
  const owner = decodeURIComponent(repositoryAccess[1]);
  const repository = decodeURIComponent(repositoryAccess[2]);
  const kind = repositoryAccess[3];
  const subject = repositoryAccess[4];
  if (!kind && request.method === 'GET') return getRepositoryAccess(env, principal, owner, repository);
  if (kind === 'collaborators' && !subject && request.method === 'PUT') return putRepositoryCollaborator(request, env, principal, owner, repository);
  if (kind === 'collaborators' && subject && request.method === 'DELETE') return deleteRepositoryCollaborator(request, env, principal, owner, repository, subject);
  if (kind === 'teams' && !subject && request.method === 'PUT') return putRepositoryTeamGrant(request, env, principal, owner, repository);
  if (kind === 'teams' && subject && request.method === 'DELETE') return deleteRepositoryTeamGrant(request, env, principal, owner, repository, subject);
  return null;
}
