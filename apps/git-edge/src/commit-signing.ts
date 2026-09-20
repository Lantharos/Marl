import { getContainer } from '@cloudflare/containers';
import { readBoundedJson, readBoundedText } from './bounded-body';
import type { GitEdgeEnv } from './env';

type CommitIdentity = { id: string; authorEmail: string };
type SigningPolicy = { repositoryMode: 'optional' | 'vigilant' | 'firewall'; identities: Array<{ email: string; mode: 'optional' | 'vigilant' | 'firewall' }> };

export async function enforcePackSigning(env: GitEdgeEnv, repositoryId: string, pushId: string, pack: number, existingPacks: string[]) {
  const container = getContainer(env.VALIDATOR_CONTAINERS, pushId);
  const path = `http://container/_marl/packs/${pushId}/${pack}/signatures`;
  const scan = await container.fetch(internalRequest(`${path}/scan`, env, { existingPacks }));
  if (!scan.ok) throw new Error((await readBoundedText(scan.body, 64 * 1024)) || 'Commit signing inspection failed.');
  const commits = await readBoundedJson<CommitIdentity[]>(scan, 32 * 1024 * 1024);
  if (!Array.isArray(commits)) throw new Error('Commit signing inspection returned invalid data.');
  for (let offset = 0; offset < commits.length; offset += 80) {
    const batch = commits.slice(offset, offset + 80);
    const response = await fetch(`${env.MARL_API_URL}/api/v1/git/signing-policy`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-marl-gateway-token': env.MARL_GIT_GATEWAY_TOKEN },
      body: JSON.stringify({ repositoryId, emails: batch.map(commit => commit.authorEmail) }), signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Commit signing policy is unavailable. Retry the push.'); }
    const policy = await readBoundedJson<SigningPolicy>(response, 8 * 1024 * 1024);
    if (!policy || !['optional', 'vigilant', 'firewall'].includes(policy.repositoryMode) || !Array.isArray(policy.identities)) throw new Error('Commit signing policy is invalid.');
    if (policy.repositoryMode !== 'firewall' && !policy.identities.some(identity => identity.mode === 'firewall')) continue;
    const checked = await container.fetch(internalRequest(`${path}/check`, env, { commits: batch.map(commit => commit.id), policy }));
    if (!checked.ok) throw new Error((await readBoundedText(checked.body, 64 * 1024)) || 'Signing firewall rejected this push.');
    await checked.body?.cancel();
  }
}

function internalRequest(url: string, env: GitEdgeEnv, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-marl-storage-token': env.MARL_GIT_GATEWAY_TOKEN }, body: JSON.stringify(body) });
}
