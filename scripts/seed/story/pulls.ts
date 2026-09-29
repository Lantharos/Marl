import type { Checkout } from '../git';
import type { Member } from '../people';
import { branches, clampedPalette, dependencyUpdate, type Branch } from '../project/branches';
import { contrast } from '../project/base';
import { organization, repository, type Team } from './workspace';

type PullDetail = { pullRequest: { sourceCommitId: string; id: string } };
type PullSeed = { branch: string; author: Member; title: string; body: string; draft?: boolean; target?: string };

function lineOf(content: string, fragment: string) {
  return content.split('\n').findIndex((line) => line.includes(fragment)) + 1;
}

export async function pushBranches(team: Team, checkout: Checkout) {
  const authors: Record<string, Member> = {
    theo: team.theo,
    mira: team.mira,
    jun: team.jun,
    sam: team.sam,
    demo: team.you
  };
  let daysAgo = 14;
  for (const branch of branches) {
    const author = authors[branch.name.split('/')[0]];
    await writeBranch(checkout, author, branch, (daysAgo -= 1.5));
    await checkout.push(author, branch.name);
  }
}

async function writeBranch(checkout: Checkout, author: Member, branch: Branch, daysAgo: number) {
  await checkout.switch(branch.name, branch.base);
  for (const [index, commit] of branch.commits.entries())
    await checkout.commit(author, commit.message, commit.files, daysAgo - index * 0.3);
}

async function openPull(seed: PullSeed) {
  const { pullRequest } = await seed.author.client.request<{ pullRequest: { number: number } }>(`${repository}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: seed.title,
      body: seed.body,
      sourceBranch: seed.branch,
      targetBranch: seed.target ?? 'main',
      draft: seed.draft ?? false
    })
  });
  return `${repository}/pulls/${pullRequest.number}`;
}

async function head(member: Member, pull: string) {
  return (await member.client.request<PullDetail>(pull)).pullRequest.sourceCommitId;
}

async function review(member: Member, pull: string, state: string, body: string) {
  await member.client.request(`${pull}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ state, body, commitId: await head(member, pull) })
  });
}

async function thread(member: Member, pull: string, path: string, line: number, body: string) {
  const { thread } = await member.client.request<{ thread: { id: string } }>(`${pull}/threads`, {
    method: 'POST',
    body: JSON.stringify({ path, side: 'new', line, body })
  });
  return thread.id;
}

async function reply(member: Member, threadId: string, body: string) {
  await member.client.request(`/api/v1/review-threads/${threadId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
}

async function comment(member: Member, pull: string, body: string) {
  await member.client.request(`${pull}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

export async function seedPulls(team: Team) {
  const { you, mira, theo, jun, sam } = team;
  const cache = await openPull({
    branch: 'theo/palette-cache',
    author: theo,
    title: 'Cache palettes by seed color and options',
    body: '## What changed\n\nAdds `cachedPalette()`, which memoizes ramps by seed color and options. Theme previews stop recomputing the same nine steps on every render.\n\n## How it was tested\n\nRendered the theme preview with 40 swatches: palette time dropped from 18 ms to under 1 ms per frame.\n\nFixes #3'
  });
  await review(you, cache, 'approved', 'Simple and effective. Let us ship it.');
  await you.client.request(`${cache}/merge`, {
    method: 'POST',
    body: JSON.stringify({ method: 'squash', commitId: await head(you, cache) })
  });

  const gamut = await openPull({
    branch: 'mira/oklch-palette',
    author: mira,
    title: 'Clamp palette chroma to the sRGB gamut',
    body: '## What changed\n\nEach palette step now searches for the highest chroma that still fits in sRGB before converting back. Hue stays exact, so saturated blues no longer drift towards grey.\n\n| Seed | Before | After |\n| --- | --- | --- |\n| `#1f6feb` | steps 3–5 grey | steps 3–5 blue |\n| `#e0735a` | unchanged | unchanged |\n\n## How it was tested\n\nAdded palette tests for step count and end-to-end contrast.\n\nCloses #1'
  });
  const loop = await thread(
    jun,
    gamut,
    'src/palette.ts',
    lineOf(clampedPalette, 'while (high - low > 0.0005)'),
    'Would a fixed number of iterations be easier to reason about? The epsilon works, but it is not obvious how many passes it takes.'
  );
  await reply(
    mira,
    loop,
    'Twelve iterations give the same precision for normal chroma values. I kept the epsilon so very desaturated seeds finish early; added a note in the docs.'
  );
  await you.client.request(`/api/v1/review-threads/${loop}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolved: true })
  });
  await review(
    jun,
    gamut,
    'commented',
    'Math checks out. I compared a few ramps against the OKLCH picker and they match.'
  );
  await review(
    theo,
    gamut,
    'approved',
    'Steps 3–5 look right now, and the search is cheap enough for the cache to absorb.'
  );

  const rounding = await openPull({
    branch: 'jun/contrast-rounding',
    author: jun,
    title: 'Stop rounding contrast ratios up across the AA boundary',
    body: '## What changed\n\n`contrastRatio` now floors to two decimals, so 4.46 no longer displays as 4.5 or passes AA.\n\n## How it was tested\n\nThe existing threshold tests.\n\nFixes #2'
  });
  const floor = await thread(
    you,
    rounding,
    'src/contrast.ts',
    lineOf(contrast, 'return Math.round(((light + 0.05)'),
    'Flooring changes what we display too. Could `contrastLevel` compare the unrounded ratio instead, and keep one decimal for display? The threshold test fails with this change.'
  );
  await reply(
    jun,
    floor,
    'Good point. I will split it into `contrastRatio` (display) and an internal raw ratio for the level check.'
  );
  await review(
    you,
    rounding,
    'changes_requested',
    'The check is failing and the display regression needs a separate path. Happy to re-review.'
  );

  await openPull({
    branch: 'sam/theming-docs',
    author: sam,
    title: 'Document dark mode token mapping',
    body: 'Adds a dark mode section to the theming guide.\n\nStill need a diagram of the token mapping before this is ready.\n\nRefs #4',
    draft: true
  });

  const mix = await openPull({
    branch: 'demo/color-mix-fallback',
    author: you,
    title: 'Experiment: emit color-mix() for out-of-gamut colors',
    body: 'Trying CSS `color-mix()` as a fallback instead of clamping in JavaScript.'
  });
  await comment(
    mira,
    mix,
    'Clamping in OKLCH (!2) gives us predictable output everywhere, including canvas and native apps. I would rather not depend on CSS here.'
  );
  await comment(you, mix, 'Fair. Closing in favor of !2.');
  await you.client.request(`${mix}/close`, { method: 'POST' });

  const parser = await openPull({
    branch: 'demo/parser-module',
    author: you,
    title: 'Move hex parsing into its own module',
    body: 'First step towards one module per color syntax, so `hsl()` support lands in a small follow-up.'
  });
  await review(theo, parser, 'approved', 'Pure move, looks good.');
  const hsl = await openPull({
    branch: 'demo/parse-hsl',
    author: you,
    target: 'demo/parser-module',
    title: 'Parse hsl() and hsla() colors',
    body: 'Adds `hsl()` and `hsla()` support on top of !6. It retargets to `main` once !6 merges.\n\nFixes #5'
  });
  await comment(
    mira,
    hsl,
    'Nice split. Could we also accept the modern space-separated syntax, `hsl(210 60% 50%)`? The pattern already allows spaces, so a test would be enough.'
  );
}

export async function seedAgent(team: Team, checkout: Checkout, apiUrl: string) {
  const { agent } = await team.you.client.request<{ agent: { id: string } }>(
    `/api/v1/organizations/${organization}/agents`,
    {
      method: 'POST',
      body: JSON.stringify({
        handle: 'lumen-bot',
        displayName: 'Lumen Bot',
        description: 'Opens pulls to keep dependencies current.'
      })
    }
  );
  const { token } = await team.you.client.request<{ token: { value: string } }>(`/api/v1/agents/${agent.id}/tokens`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Dependency updates', scopes: ['repo:read', 'repo:write'], expiresDays: 30 })
  });
  await team.you.client.request(`${repository}/access/collaborators`, {
    method: 'PUT',
    body: JSON.stringify({ userId: agent.id, role: 'write' })
  });
  await checkout.switch(dependencyUpdate.name, 'main');
  const bot = {
    ...team.you,
    token: token.value,
    person: { handle: 'lumen-bot', name: 'Lumen Bot', bio: '', website: '' }
  };
  for (const commit of dependencyUpdate.commits) await checkout.commit(bot, commit.message, commit.files, 1);
  await checkout.push(bot, dependencyUpdate.name);
  const created = await fetch(`${apiUrl}${repository}/pulls`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.value}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Bump typescript from 6.0.0 to 6.1.2',
      body: 'Updates `typescript` to 6.1.2. The release notes list no breaking changes for our usage.\n\nThis pull was opened automatically.',
      sourceBranch: dependencyUpdate.name,
      targetBranch: 'main'
    })
  });
  if (!created.ok) throw new Error(`The agent could not open its pull: ${await created.text()}`);
}
