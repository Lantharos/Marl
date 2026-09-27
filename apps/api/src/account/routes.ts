import { getSigningSettings, updateSigningSettings } from '../git/commit-signing';
import { json } from '../http/http';
import { route } from '../http/router';
import { acceptLegalTerms } from './legal';
import { createPersonalAccessToken, listPersonalAccessTokens, revokePersonalAccessToken } from './developer-tokens';
import { getProfile, listSessions, updateProfile, uploadAvatar } from './profile';
import { createSshKey, deleteSshKey, listSshKeys } from './ssh-keys';
import {
  addUserEmail,
  deleteUserEmail,
  listUserEmails,
  resendUserEmailVerification,
  verifyUserEmail
} from './user-emails';

export const accountRoutes = [
  route('GET', '/session', 'user', ({ principal }) => json({ user: principal })),
  route('GET', '/profile', 'user', ({ env, principal }) => getProfile(env, principal)),
  route('PATCH', '/profile', 'user', ({ request, env, principal }) => updateProfile(request, env, principal)),
  route('PUT', '/profile/avatar', 'user', ({ request, env, principal }) => uploadAvatar(request, env, principal)),
  route('GET', '/sessions', 'user', ({ env, principal }) => listSessions(env, principal)),
  route('GET', '/emails', 'user', ({ env, principal }) => listUserEmails(env, principal)),
  route('POST', '/emails', 'user', ({ request, env, principal }) => addUserEmail(request, env, principal)),
  route('POST', '/emails/verify', 'user', ({ request, env, principal }) => verifyUserEmail(request, env, principal)),
  route('POST', '/emails/:id(email_[a-z0-9]+)/resend', 'user', ({ env, principal }, { id }) =>
    resendUserEmailVerification(env, principal, id)
  ),
  route('DELETE', '/emails/:id(email_[a-z0-9]+)', 'user', ({ request, env, principal }, { id }) =>
    deleteUserEmail(request, env, principal, id)
  ),
  route('GET', '/tokens', 'user', ({ env, principal }) => listPersonalAccessTokens(env, principal)),
  route('POST', '/tokens', 'user', ({ request, env, principal }) => createPersonalAccessToken(request, env, principal)),
  route('DELETE', '/tokens/:id(token_[a-z0-9]+)', 'user', ({ request, env, principal }, { id }) =>
    revokePersonalAccessToken(request, env, principal, id)
  ),
  route('GET', '/ssh-keys', 'user', ({ env, principal }) => listSshKeys(env, principal)),
  route('POST', '/ssh-keys', 'user', ({ request, env, principal }) => createSshKey(request, env, principal)),
  route('DELETE', '/ssh-keys/:id(sshkey_[a-z0-9]+)', 'user', ({ request, env, principal }, { id }) =>
    deleteSshKey(request, env, principal, id)
  ),
  route('POST', '/legal/accept', 'user', ({ request, env, principal }) => acceptLegalTerms(request, env, principal)),
  route('GET', '/signing', 'user', ({ env, principal }) => getSigningSettings(env, principal)),
  route('PATCH', '/signing', 'user', ({ request, env, principal }) => updateSigningSettings(request, env, principal))
];
