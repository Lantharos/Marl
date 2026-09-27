import { json, problem } from '../http/http';
import { route } from '../http/router';
import { enableRepository, unsuspendUser } from './actions';
import { createReport, listReports, resolveReport } from './reports';

const staffOnly = () => problem(404, 'not_found', 'The requested Marl API route does not exist.');

export const moderationRoutes = [
  route('POST', '/reports', 'user', ({ request, env, principal }) => createReport(request, env, principal)),
  route('GET', '/admin/reports', 'user', ({ env, principal, url }) => listReports(env, principal, url)),
  route('POST', '/admin/reports/:id(report_[a-z0-9]+)/resolve', 'user', ({ request, env, principal }, { id }) =>
    resolveReport(request, env, principal, id)
  ),
  route('POST', '/admin/repositories/:id(repo_[a-z0-9]+)/enable', 'user', async ({ env, principal }, { id }) => {
    if (!principal.staff) return staffOnly();
    await enableRepository(env, principal, id);
    return json({ enabled: true });
  }),
  route('POST', '/admin/users/:id([A-Za-z0-9_]+)/restore', 'user', async ({ env, principal }, { id }) => {
    if (!principal.staff) return staffOnly();
    await unsuspendUser(env, principal, id);
    return json({ restored: true });
  })
];
