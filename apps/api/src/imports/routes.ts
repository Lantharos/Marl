import { route } from '../http/router';
import { getImport, startImport } from './imports';

export const importRoutes = [
  route('POST', '/imports', 'user', ({ request, env, principal }) => startImport(request, env, principal)),
  route('GET', '/imports/:id(import_[a-z0-9]+)', 'user', ({ env, principal }, { id }) => getImport(env, principal, id))
];
