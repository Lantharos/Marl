import { env } from 'cloudflare:workers';
import { b, home, status, slack } from 'pult';
import { reports } from './reports.pult';
import { operator } from './team.pult';

export const statusPage = status({
  title: 'Marl',
  website: 'https://marl.sh',
  components: {
    web: { label: 'Website', check: 'https://marl.sh' },
    api: { label: 'API', monitored: true },
    git: { label: 'Git over HTTPS', check: 'https://git.marl.sh/health' },
    ssh: 'Git over SSH',
    runners: 'CI runners',
    email: 'Email notifications'
  },
  alert: [operator, slack('incidents')]
});

type Totals = { people: number; repositories: number; joined: number; created: number };

export const overview = home(async () => {
  const totals = (await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM users WHERE kind='person' AND deleted_at IS NULL) AS people,
      (SELECT COUNT(*) FROM repositories) AS repositories,
      (SELECT COUNT(*) FROM users WHERE kind='person' AND created_at>=datetime('now','-7 days')) AS joined,
      (SELECT COUNT(*) FROM repositories WHERE created_at>=datetime('now','-7 days')) AS created`
  ).first<Totals>())!;
  return [
    b.stats({
      People: { value: totals.people, note: `${totals.joined} joined this week` },
      Repositories: { value: totals.repositories, note: `${totals.created} created this week` }
    }),
    b.columns(
      [b.count(reports, { filter: { state: 'open' }, label: 'Open reports' })],
      [b.chart(reports, { range: '7d', title: 'Reports, last 7 days' })]
    ),
    b.items(reports, { filter: { state: 'open' }, limit: 5, label: 'Waiting for a moderator' })
  ];
});
