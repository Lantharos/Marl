import { accountRoutes } from './account/routes';
import { handleAuth } from './auth/handler';
import { authenticate } from './auth/principal';
import { ciRoutes } from './ci/routes';
import { authenticateRunner, hasRunnerCredential } from './ci/runners/runners';
import type { Env } from './core/platform';
import { gitRoutes } from './git/routes';
import { homeRoutes } from './home/routes';
import { json, problem } from './http/http';
import { matchRoute, route, type RequestContext } from './http/router';
import { identityRoutes } from './identity/routes';
import { runImports } from './imports/queue';
import { importRoutes } from './imports/routes';
import { issueRoutes } from './issues/routes';
import { moderationRoutes } from './moderation/routes';
import { sendNotificationEmails } from './notifications/digest';
import { notificationRoutes } from './notifications/routes';
import { deliverWebhooks } from './webhooks/delivery';
import { webhookRoutes } from './webhooks/routes';
import { pullRoutes } from './pulls/routes';
import { releaseRoutes } from './releases/routes';
import { purgeDeletedRepositories } from './repositories/lifecycle';
import { repositoryRoutes } from './repositories/routes';

const routes = [
  route('GET', '/auth/config', 'public', ({ env }) =>
    json({ emailVerificationRequired: env.ENVIRONMENT !== 'development' })
  ),
  ...gitRoutes,
  ...accountRoutes,
  ...identityRoutes,
  ...homeRoutes,
  ...repositoryRoutes,
  ...issueRoutes,
  ...pullRoutes,
  ...releaseRoutes,
  ...ciRoutes,
  ...moderationRoutes,
  ...notificationRoutes,
  ...webhookRoutes,
  ...importRoutes
];

const notificationCron = '*/10 * * * *';

const notFound = () => problem(404, 'not_found', 'The requested Marl API route does not exist.');

async function withinRateLimit(env: Env, key: string) {
  const result = await env.RATE_LIMITER.limit({ key });
  return result.success;
}

async function handle(request: Request, env: Env, execution: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json({ service: 'marl-api', status: 'ok' });
  if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) return handleAuth(request, env);

  const match = matchRoute(routes, request.method, url.pathname);
  if (!match) return notFound();
  if ('allow' in match)
    return problem(405, 'method_not_allowed', 'This method is not allowed.', { allow: match.allow });

  const address = request.headers.get('cf-connecting-ip') ?? 'anonymous';
  const gatewayTrusted = Boolean(
    env.GIT_GATEWAY_TOKEN && request.headers.get('x-marl-gateway-token') === env.GIT_GATEWAY_TOKEN
  );
  const context: RequestContext = { request, env, url, execution, principal: null, runner: null, gatewayTrusted };
  const { route: matched, params } = match;

  if (matched.access === 'gateway') return gatewayTrusted ? matched.handler(context, params) : notFound();
  if (matched.access === 'public') {
    if (!(await withinRateLimit(env, address)))
      return problem(429, 'rate_limited', 'Too many requests. Try again shortly.');
    return matched.handler(context, params);
  }

  const runnerCredential = hasRunnerCredential(request);
  context.runner = runnerCredential ? await authenticateRunner(request, env) : null;
  if (!runnerCredential || !context.runner || request.headers.has('cookie'))
    context.principal = await authenticate(request, env);
  if (!gatewayTrusted && !(await withinRateLimit(env, context.principal?.id ?? context.runner?.id ?? address)))
    return problem(429, 'rate_limited', 'Too many requests. Try again shortly.');
  if (matched.access === 'runner' && !context.runner) return notFound();
  if (matched.access === 'user' && !context.principal)
    return problem(401, 'authentication_required', 'Sign in to use the Marl API.');
  return matched.handler(context, params);
}

export default {
  async scheduled(controller: ScheduledController, env: Env) {
    if (controller.cron === notificationCron) await sendNotificationEmails(env);
    else await purgeDeletedRepositories(env);
  },
  fetch: handle,
  async queue(batch: MessageBatch, env: Env) {
    if (batch.queue === 'marl-imports') await runImports(batch as MessageBatch<{ importId: string }>, env);
    else await deliverWebhooks(batch as MessageBatch<{ deliveryId: string }>, env);
  }
};

export { PullRoom } from './pulls/realtime/room';
export { RunRoom } from './ci/runs/room';
