import type { MarlClient } from '../qualification/client';

type Lease = { id: string; leaseToken: string; branch: string; run: { name: string } };

const passingLog = (branch: string) => `$ bun install --frozen-lockfile
bun install v1.3.2
 + typescript@6.1.2
 1 package installed [312.00ms]
$ bun run check
$ tsc --noEmit
$ bun test
bun test v1.3.2

test/contrast.test.ts:
✓ contrastRatio > black on white is the maximum ratio [0.21ms]
✓ contrastRatio > levels follow WCAG thresholds [0.04ms]
${branch.includes('palette') ? '\ntest/palette.test.ts:\n✓ palette > returns the requested number of steps [0.33ms]\n✓ palette > the ends of the ramp pass AA against each other [0.41ms]\n' : ''}
 ${branch.includes('palette') ? 4 : 2} pass
 0 fail
`;

const failingLog = `$ bun install --frozen-lockfile
bun install v1.3.2
 1 package installed [298.00ms]
$ bun run check
$ tsc --noEmit
$ bun test
bun test v1.3.2

test/contrast.test.ts:
✓ contrastRatio > black on white is the maximum ratio [0.19ms]
✗ contrastRatio > levels follow WCAG thresholds [0.51ms]

error: expect(received).toBe(expected)

Expected: "AA"
Received: "AA large"

      at <anonymous> (test/contrast.test.ts:12:31)

 1 pass
 1 fail
error: script "test" exited with code 1
`;

export async function registerRunner(client: MarlClient, organization: string) {
  const { enrollment } = await client.request<{ enrollment: { token: string } }>('/api/v1/runner-enrollments', {
    method: 'POST',
    body: JSON.stringify({ organization })
  });
  const registration = await fetch(`${client.apiUrl}/api/v1/runner/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      enrollmentToken: enrollment.token,
      name: 'build-01',
      labels: ['docker'],
      platform: 'linux',
      architecture: 'x86_64',
      version: '0.4.0'
    })
  });
  return ((await registration.json()) as { token: string }).token;
}

export async function drainJobs(apiUrl: string, runnerToken: string, failingBranches: string[]) {
  const auth = { authorization: `Bearer ${runnerToken}` };
  for (;;) {
    const claim = await fetch(`${apiUrl}/api/v1/runner/claim`, { method: 'POST', headers: auth });
    if (claim.status === 204) return;
    const { job } = (await claim.json()) as { job: Lease };
    const failed = failingBranches.includes(job.branch);
    const headers = { ...auth, 'x-marl-job-lease': job.leaseToken };
    await fetch(`${apiUrl}/api/v1/runner/jobs/${job.id}/logs/0`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'text/plain' },
      body: failed ? failingLog : passingLog(job.branch)
    });
    await fetch(`${apiUrl}/api/v1/runner/jobs/${job.id}/complete`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ state: failed ? 'failure' : 'success', exitCode: failed ? 1 : 0 })
    });
  }
}
