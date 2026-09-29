import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { teammates, you } from './seed/accounts';
import { query, spreadTimestamps } from './seed/database';
import { Checkout } from './seed/git';
import { signUp } from './seed/people';
import { drainJobs, registerRunner } from './seed/runner';
import { seedIssues } from './seed/story/issues';
import { pushBranches, seedAgent, seedPulls } from './seed/story/pulls';
import {
  createOrganization,
  createRepository,
  organization,
  publishRelease,
  repository,
  writeHistory,
  writeSideProjects,
  type Team
} from './seed/story/workspace';

const apiUrl = 'http://127.0.0.1:42618';
const gitUrl = 'http://127.0.0.1:42619';
const webUrl = 'http://localhost:42617';

function step(label: string) {
  console.log(`\x1b[38;2;238;117;83m●\x1b[0m ${label}`);
}

const healthy = await fetch(`${apiUrl}/health`).then(
  (response) => response.ok,
  () => false
);
if (!healthy) throw new Error('Start the dev stack with `bun dev` before seeding.');
if ((await query<{ id: string }>(`SELECT id FROM users WHERE handle='${you.handle}'`)).length)
  throw new Error(
    'This database already has demo data. Stop `bun dev`, run `bun run db:reset`, start it again, and reseed.'
  );

const workspace = await mkdtemp(join(tmpdir(), 'marl-seed-'));
const startedAt = new Date();
try {
  step('Create people');
  const team: Team = {
    you: await signUp(apiUrl, gitUrl, workspace, you),
    mira: await signUp(apiUrl, gitUrl, workspace, teammates.mira),
    theo: await signUp(apiUrl, gitUrl, workspace, teammates.theo),
    jun: await signUp(apiUrl, gitUrl, workspace, teammates.jun),
    sam: await signUp(apiUrl, gitUrl, workspace, teammates.sam)
  };

  step('Create the Lumen organization and repository');
  await createOrganization(team);
  await createRepository(
    team.you.client,
    organization,
    'lumen',
    'Accessible color palettes, contrast checks, and OKLCH conversion for design systems.'
  );
  const checkout = await Checkout.create(join(workspace, 'lumen'), `${gitUrl}/${organization}/lumen.git`);
  await writeHistory(team, checkout);
  await team.you.client.waitFor(
    () => team.you.client.request<{ branches: unknown[] }>(`${repository}/branches`),
    (value) => value.branches.length > 0,
    'The repository was not indexed'
  );
  await publishRelease(
    team.you,
    'v0.2.0',
    'Lumen 0.2.0',
    '## Highlights\n\n- `palette()` builds perceptually even tonal ramps in OKLCH.\n- `contrastRatio()` rounds to one decimal place.\n\n## Install\n\n```sh\nbun add @lumen/color@0.2.0\n```'
  );

  step('Open issues');
  await seedIssues(team);

  step('Push branches and open pulls');
  await pushBranches(team, checkout);
  await seedPulls(team);
  await seedAgent(team, checkout, apiUrl);

  step('Run checks');
  await drainJobs(apiUrl, await registerRunner(team.you.client, organization), ['jun/contrast-rounding']);
  await team.you.client.request(`${repository}/branch-rules`, {
    method: 'PUT',
    body: JSON.stringify({
      pattern: 'main',
      requiredApprovals: 1,
      requiredChecks: ['Verify / Test'],
      requireConversations: true,
      carryApprovalsForward: false,
      allowAuthorMerge: false,
      allowedMergeMethods: ['merge', 'squash', 'rebase'],
      mergeQueue: false
    })
  });

  step('Finish the workspace');
  await publishRelease(
    team.theo,
    'v0.3.0-beta.1',
    'Lumen 0.3.0 beta 1',
    'Early build with palette caching (!1). Contrast fixes are still in review.',
    true
  );
  for (const member of Object.values(team)) await member.client.request(`${repository}/star`, { method: 'PUT' });
  for (const [title, body] of [
    ['Needs a test', 'Could you add a test that covers this case? It will keep the fix from regressing.'],
    ['Thanks for the fix', 'Thanks for the fix! Merging once checks pass.'],
    ['Contrast reminder', 'Please check both themes: every text token has to reach 4.5:1 against every surface.']
  ])
    await team.you.client.request('/api/v1/saved-replies', { method: 'POST', body: JSON.stringify({ title, body }) });
  await writeSideProjects(team, workspace, gitUrl);

  step('Spread activity over the past weeks');
  await spreadTimestamps(startedAt, 24);
  console.log(
    `\nDemo data is ready at ${webUrl}. Sign in as "${you.handle}" with the password in scripts/seed/accounts.ts.`
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
