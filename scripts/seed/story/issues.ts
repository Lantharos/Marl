import type { Member } from '../people';
import { repository, type Team } from './workspace';

type Label = { id: string; name: string };
type IssueSeed = {
  author: Member;
  title: string;
  body: string;
  labels: string[];
  assignees?: Member[];
  comments?: Array<[Member, string]>;
  closed?: Member;
};

async function labelsFor(member: Member, number: number, names: string[]) {
  const detail = await member.client.request<{ issue: { availableLabels: Label[] } }>(`${repository}/issues/${number}`);
  const known = new Map(detail.issue.availableLabels.map((label) => [label.name, label.id]));
  const ids: string[] = [];
  for (const name of names) {
    let id = known.get(name);
    if (!id) {
      const created = await member.client.request<{ label: Label }>(`${repository}/issues/${number}/labels`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      id = created.label.id;
      known.set(name, id);
    }
    ids.push(id);
  }
  return ids;
}

async function openIssue(seed: IssueSeed) {
  const { issue } = await seed.author.client.request<{ issue: { number: number } }>(`${repository}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: seed.title, body: seed.body })
  });
  const path = `${repository}/issues/${issue.number}`;
  await seed.author.client.request(`${path}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify({
      labelIds: await labelsFor(seed.author, issue.number, seed.labels),
      assigneeIds: (seed.assignees ?? []).map((member) => member.id)
    })
  });
  for (const [member, body] of seed.comments ?? [])
    await member.client.request(`${path}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  if (seed.closed)
    await seed.closed.client.request(`${path}/state`, { method: 'POST', body: JSON.stringify({ state: 'closed' }) });
  return issue.number;
}

export async function seedIssues({ you, mira, theo, jun, sam }: Team) {
  const issues: IssueSeed[] = [
    {
      author: mira,
      title: 'Palette steps look muddy for saturated blues',
      body: 'Generating a ramp from `#1f6feb` gives steps 3–5 a grey cast. The seed chroma is higher than sRGB can show at those lightness values, so the conversion clips each channel separately and the hue drifts.\n\nWe should clamp chroma in OKLCH before converting back instead.',
      labels: ['enhancement'],
      assignees: [mira],
      comments: [
        [theo, 'A binary search on chroma per step should be cheap enough. Nine steps × ~12 iterations is nothing.'],
        [you, 'Agreed. Let us keep the hue exactly and only give up chroma.']
      ]
    },
    {
      author: jun,
      title: 'contrastRatio rounds 4.46 up to 4.5 and passes AA',
      body: 'We round the ratio to one decimal before comparing it with the WCAG thresholds, so `#767676` on `#f2f2f2` (4.46:1) reports **AA**. The spec compares the unrounded value.\n\n```ts\ncontrastLevel(contrastRatio(parseColor("#767676"), parseColor("#f2f2f2"))) // "AA", should be "AA large"\n```',
      labels: ['bug'],
      assignees: [jun],
      comments: [
        [sam, '@demo is this a blocker for 0.3.0? The docs promise AA for every text token.'],
        [you, 'Yes, it needs to land before the release. Wrong answers here are worse than slow ones.']
      ]
    },
    {
      author: theo,
      title: 'Cache repeated palette calls',
      body: 'Theme previews call `palette()` with the same seed dozens of times per render. A small cache keyed by the seed color and options would remove most of that work.',
      labels: ['enhancement']
    },
    {
      author: sam,
      title: 'Document how tokens map in dark mode',
      body: 'The theming guide only covers the light theme. We should explain how the same palette maps to dark surfaces and why raised surfaces get lighter.',
      labels: ['documentation'],
      assignees: [sam]
    },
    {
      author: you,
      title: 'Support hsl() input',
      body: 'Designers paste `hsl()` values from Figma all the time. `parseColor` should accept `hsl()` and `hsla()` with or without the `deg` unit.',
      labels: ['enhancement'],
      assignees: [you],
      comments: [[mira, 'I would split the parsers into one module per syntax first; `parse.ts` is getting crowded.']]
    },
    {
      author: jun,
      title: 'parseColor accepts rgb(300, 0, 0)',
      body: 'Channels above 255 pass through unchanged and break the contrast math later. We should clamp or reject them.',
      labels: ['bug', 'good first issue'],
      comments: [[sam, 'Tagged this as a good first issue. The fix is local to `parse.ts`.']]
    },
    {
      author: sam,
      title: 'Export the PaletteOptions type',
      body: 'People wrapping `palette()` need the options type. It is declared but not exported from the package entry.',
      labels: ['enhancement'],
      comments: [[theo, 'Exported in the 0.2.0 prep commit.']],
      closed: theo
    },
    {
      author: you,
      title: 'Why OKLCH instead of HSLuv?',
      body: 'Writing down the reasoning so we can link to it: OKLCH has better hue linearity for blues and is supported natively in CSS, so users can paste our output straight into stylesheets.',
      labels: ['documentation'],
      comments: [[mira, 'Worth adding to the README eventually. Closing since the decision is recorded here.']],
      closed: mira
    }
  ];
  for (const seed of issues) await openIssue(seed);
}
