import { route } from '../http/router';
import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  pingWebhook,
  redeliver,
  updateWebhook
} from './hooks';
import { organizationScope, repositoryScope } from './scope';

const repository = '/repositories/:owner/:repo';
const organization = '/organizations/:slug';
const webhook = '/webhooks/:id(webhook_[a-z0-9]+)';

export const webhookRoutes = [
  route('GET', `${repository}/webhooks`, 'user', async ({ env, principal }, { owner, repo }) =>
    listWebhooks(env, await repositoryScope(env, principal, owner, repo))
  ),
  route('POST', `${repository}/webhooks`, 'user', async ({ request, env, principal }, { owner, repo }) =>
    createWebhook(request, env, principal, await repositoryScope(env, principal, owner, repo))
  ),
  route('GET', `${organization}/webhooks`, 'user', async ({ env, principal }, { slug }) =>
    listWebhooks(env, await organizationScope(env, principal, slug))
  ),
  route('POST', `${organization}/webhooks`, 'user', async ({ request, env, principal }, { slug }) =>
    createWebhook(request, env, principal, await organizationScope(env, principal, slug))
  ),
  route('PATCH', webhook, 'user', ({ request, env, principal }, { id }) => updateWebhook(request, env, principal, id)),
  route('DELETE', webhook, 'user', ({ env, principal }, { id }) => deleteWebhook(env, principal, id)),
  route('GET', `${webhook}/deliveries`, 'user', ({ env, principal }, { id }) => listDeliveries(env, principal, id)),
  route('POST', `${webhook}/ping`, 'user', ({ env, principal }, { id }) => pingWebhook(env, principal, id)),
  route('POST', '/webhook-deliveries/:id(delivery_[a-z0-9]+)/redeliver', 'user', ({ env, principal }, { id }) =>
    redeliver(env, principal, id)
  )
];
