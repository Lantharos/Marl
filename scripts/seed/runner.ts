import type { RunnerJobLease } from '../../packages/contracts/src/code/ci';
import type { MarlClient } from '../qualification/client';

const install = `bun install v1.3.2
 + typescript@6.1.2
 1 package installed [312.00ms]
`;

const passingTests = (branch: string) => `bun test v1.3.2

test/contrast.test.ts:
\x1b[32m✓\x1b[0m contrastRatio > black on white is the maximum ratio \x1b[2m[0.21ms]\x1b[0m
\x1b[32m✓\x1b[0m contrastRatio > levels follow WCAG thresholds \x1b[2m[0.04ms]\x1b[0m
${branch.includes('palette') ? '\ntest/palette.test.ts:\n\x1b[32m✓\x1b[0m palette > returns the requested number of steps \x1b[2m[0.33ms]\x1b[0m\n\x1b[32m✓\x1b[0m palette > the ends of the ramp pass AA against each other \x1b[2m[0.41ms]\x1b[0m\n' : ''}
 \x1b[32m${branch.includes('palette') ? 4 : 2} pass\x1b[0m
 0 fail
`;

const failingTests = `bun test v1.3.2

test/contrast.test.ts:
\x1b[32m✓\x1b[0m contrastRatio > black on white is the maximum ratio \x1b[2m[0.19ms]\x1b[0m
\x1b[31m✗\x1b[0m contrastRatio > levels follow WCAG thresholds \x1b[2m[0.51ms]\x1b[0m

error: expect(received).toBe(expected)

Expected: "AA"
Received: "AA large"

      at <anonymous> (test/contrast.test.ts:12:31)

 1 pass
 \x1b[31m1 fail\x1b[0m
error: script "test" exited with code 1
`;

function jobLog(job: RunnerJobLease, failed: boolean) {
  return [
    `marl · ${job.run.name} #${job.run.number}\n`,
    `repository: ${job.repository.owner}/${job.repository.name}\ncommit: ${job.commitId}\n\n`,
    `container: ${job.runtime.image}\n`,
    '\n── Install ──\n',
    install,
    '\n── Check types ──\n',
    '$ tsc --noEmit\n',
    '\n── Test ──\n',
    failed ? failingTests : passingTests(job.branch)
  ];
}

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
    const { job } = (await claim.json()) as { job: RunnerJobLease };
    const failed = failingBranches.includes(job.branch);
    const headers = { ...auth, 'x-marl-job-lease': job.leaseToken };
    for (const [sequence, chunk] of jobLog(job, failed).entries()) {
      await fetch(`${apiUrl}/api/v1/runner/jobs/${job.id}/logs/${sequence}`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'text/plain' },
        body: chunk
      });
    }
    await fetch(`${apiUrl}/api/v1/runner/jobs/${job.id}/complete`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ state: failed ? 'failure' : 'success', exitCode: failed ? 1 : 0 })
    });
  }
}
