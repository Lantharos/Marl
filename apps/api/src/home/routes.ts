import { route } from '../http/router';
import { previewMarkdown } from '../repositories/content/documents';
import { getDashboard } from './dashboard';
import { listInbox, markInboxRead, updateInboxState } from './inbox';
import { search } from './search';
import { getShell } from './shell';

export const homeRoutes = [
  route('GET', '/shell', 'user', ({ env, principal }) => getShell(env, principal)),
  route('GET', '/dashboard', 'user', ({ env, principal }) => getDashboard(env, principal)),
  route('GET', '/inbox', 'user', ({ env, principal, url }) => listInbox(env, principal, url)),
  route('POST', '/inbox/read', 'user', ({ env, principal }) => markInboxRead(env, principal)),
  route('PATCH', '/inbox/:kind(issue|pull|run)/:id([a-z0-9_]+)', 'user', ({ request, env, principal }, p) =>
    updateInboxState(request, env, principal, p.kind, p.id)
  ),
  route('GET', '/search', 'user', ({ env, principal, url }) => search(env, principal, url)),
  route('POST', '/markdown', 'user', ({ request }) => previewMarkdown(request))
];
