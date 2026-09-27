import { route } from '../http/router';
import {
  getNotificationPreferences,
  getRepositoryNotificationLevel,
  setRepositoryNotificationLevel,
  unsubscribe,
  updateNotificationPreferences
} from './preferences';

const repository = '/repositories/:owner/:repo';

export const notificationRoutes = [
  route('GET', '/notifications/preferences', 'user', ({ env, principal }) =>
    getNotificationPreferences(env, principal)
  ),
  route('PATCH', '/notifications/preferences', 'user', ({ request, env, principal }) =>
    updateNotificationPreferences(request, env, principal)
  ),
  route('GET', '/notifications/unsubscribe', 'public', ({ env, url }) =>
    unsubscribe(env, url.searchParams.get('token'), url)
  ),
  route('POST', '/notifications/unsubscribe', 'public', ({ env, url }) =>
    unsubscribe(env, url.searchParams.get('token'), url)
  ),
  route('GET', `${repository}/notifications`, 'user', ({ env, principal }, { owner, repo }) =>
    getRepositoryNotificationLevel(env, principal, owner, repo)
  ),
  route('PUT', `${repository}/notifications`, 'user', ({ request, env, principal }, { owner, repo }) =>
    setRepositoryNotificationLevel(request, env, principal, owner, repo)
  )
];
