import { readAvatar } from '../account/profile';
import { route } from '../http/router';
import {
  acceptOrganizationInvitation,
  addTeamMember,
  createTeam,
  deleteTeam,
  inviteOrganizationMember,
  removeOrganizationMember,
  removeTeamMember,
  revokeOrganizationInvitation,
  updateOrganizationMember
} from './organization-access';
import {
  createOrganization,
  getOrganization,
  getOrganizationAccess,
  listOrganizations,
  readOrganizationAvatar,
  updateOrganization,
  uploadOrganizationAvatar
} from './organizations';
import { listProfileRepositories } from './profile-repositories';
import { getPublicIndex } from './public-index';
import { getPublicIdentityProfile } from './public-profiles';

const organization = '/organizations/:slug';

export const identityRoutes = [
  route('GET', '/avatars/:user/:file', 'public', ({ env }, { user, file }) => readAvatar(env, user, file)),
  route('GET', '/organization-avatars/:organization/:file', 'public', ({ env }, { organization, file }) =>
    readOrganizationAvatar(env, organization, file)
  ),
  route('GET', '/profiles/:handle', 'public', ({ env }, { handle }) => getPublicIdentityProfile(env, handle)),
  route('GET', '/profiles/:handle/repositories', 'public', ({ request, env }, { handle }) =>
    listProfileRepositories(request, env, handle)
  ),
  route('GET', '/public-index', 'public', ({ env }) => getPublicIndex(env)),
  route('GET', '/organizations', 'user', ({ env, principal }) => listOrganizations(env, principal)),
  route('POST', '/organizations', 'user', ({ request, env, principal }) => createOrganization(request, env, principal)),
  route('GET', organization, 'user', ({ env, principal }, { slug }) => getOrganization(env, principal, slug)),
  route('PATCH', organization, 'user', ({ request, env, principal }, { slug }) =>
    updateOrganization(request, env, principal, slug)
  ),
  route('PUT', `${organization}/avatar`, 'user', ({ request, env, principal }, { slug }) =>
    uploadOrganizationAvatar(request, env, principal, slug)
  ),
  route('GET', `${organization}/access`, 'user', ({ env, principal }, { slug }) =>
    getOrganizationAccess(env, principal, slug)
  ),
  route('POST', `${organization}/access/invitations`, 'user', ({ request, env, principal }, { slug }) =>
    inviteOrganizationMember(request, env, principal, slug)
  ),
  route('DELETE', `${organization}/access/invitations/:id`, 'user', ({ request, env, principal }, { slug, id }) =>
    revokeOrganizationInvitation(request, env, principal, slug, id)
  ),
  route('PATCH', `${organization}/access/members/:user`, 'user', ({ request, env, principal }, { slug, user }) =>
    updateOrganizationMember(request, env, principal, slug, user)
  ),
  route('DELETE', `${organization}/access/members/:user`, 'user', ({ request, env, principal }, { slug, user }) =>
    removeOrganizationMember(request, env, principal, slug, user)
  ),
  route('POST', `${organization}/access/teams`, 'user', ({ request, env, principal }, { slug }) =>
    createTeam(request, env, principal, slug)
  ),
  route('DELETE', `${organization}/access/teams/:team`, 'user', ({ request, env, principal }, { slug, team }) =>
    deleteTeam(request, env, principal, slug, team)
  ),
  route('POST', `${organization}/access/teams/:team/members`, 'user', ({ request, env, principal }, { slug, team }) =>
    addTeamMember(request, env, principal, slug, team)
  ),
  route('DELETE', `${organization}/access/teams/:team/members/:user`, 'user', ({ env, principal }, params) =>
    removeTeamMember(env, principal, params.slug, params.team, params.user)
  ),
  route('POST', '/invitations/:token/accept', 'user', ({ env, principal }, { token }) =>
    acceptOrganizationInvitation(env, principal, token)
  )
];
