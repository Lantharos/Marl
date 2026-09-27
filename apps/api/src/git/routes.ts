import { authorizeSsh } from '../account/ssh-keys';
import { authorizeRunnerGit } from '../ci/runners/runners';
import { readiness } from '../http/health';
import { problem } from '../http/http';
import { route } from '../http/router';
import { purgeDeletedRepositories } from '../repositories/lifecycle';
import { authorizeGit, indexGit, listPendingGitIndexes } from './indexing';
import { getSigningPolicy } from './commit-signing';

const gitServices = ['git-upload-pack', 'git-receive-pack'];
const gatewayActor = /^[a-z]+_[a-z0-9]{16,128}$/;

export const gitRoutes = [
  route('GET', '/maintenance/readiness', 'gateway', ({ env }) => readiness(env)),
  route('POST', '/maintenance/purge', 'gateway', async ({ env }) => {
    await purgeDeletedRepositories(env);
    return new Response(null, { status: 204 });
  }),
  route('GET', '/git/pending-indexes', 'gateway', ({ env }) => listPendingGitIndexes(env)),
  route('POST', '/git/signing-policy', 'gateway', ({ request, env }) => getSigningPolicy(request, env)),
  route('GET', '/git/ssh/authorize', 'gateway', ({ request, env }) => authorizeSsh(request, env)),
  route('POST', '/git/index', 'optional', ({ request, env, principal, gatewayTrusted }) => {
    if (!principal && !gatewayTrusted) return problem(401, 'authentication_required', 'Authenticate the Git gateway.');
    return indexGit(request, env, principal, gatewayTrusted);
  }),
  route('GET', '/git/authorize', 'optional', ({ request, env, url, principal, runner, gatewayTrusted }) => {
    const owner = url.searchParams.get('owner');
    const repository = url.searchParams.get('repository');
    const service = url.searchParams.get('service') ?? 'git-upload-pack';
    if (!owner || !repository || !gitServices.includes(service))
      return problem(422, 'invalid_git_request', 'Owner, repository, or Git service is invalid.');
    if (runner && service === 'git-upload-pack') return authorizeRunnerGit(env, runner, owner, repository);
    const actor = request.headers.get('x-marl-actor-id') ?? '';
    const gatewayActorId = gatewayTrusted && gatewayActor.test(actor) ? actor : undefined;
    return authorizeGit(env, principal, owner, repository, service, gatewayTrusted, gatewayActorId);
  })
];
