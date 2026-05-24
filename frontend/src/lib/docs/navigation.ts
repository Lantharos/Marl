export type DocsNavItem = {
	href: string;
	title: string;
	description: string;
	group: string;
};

export const docsNav: DocsNavItem[] = [
	{
		href: '/docs',
		title: 'Overview',
		description: 'How sty, PIG, hosted review, and the API fit together.',
		group: 'Start'
	},
	{
		href: '/docs/getting-started',
		title: 'Getting Started',
		description: 'Install sty, sign in, connect a repository, and sync the first save.',
		group: 'Start'
	},
	{
		href: '/docs/sty',
		title: 'sty Overview',
		description: 'Hosted projects, tenants, workspaces, issues, releases, and automation.',
		group: 'sty'
	},
	{
		href: '/docs/sty/cli',
		title: 'sty CLI',
		description: 'Login, init, clone, fork, sendwork, collaborators, projects, tenants, and leaves.',
		group: 'sty'
	},
	{
		href: '/docs/sty/projects',
		title: 'Projects and Access',
		description: 'Tenants, folders, collaborators, visibility, archive state, and workspace privacy.',
		group: 'sty'
	},
	{
		href: '/docs/sty/review',
		title: 'Review Workflow',
		description: 'Ready workspaces, comments, approvals, checks, merge rules, and notifications.',
		group: 'sty'
	},
	{
		href: '/docs/sty/development',
		title: 'Development',
		description: 'Run the Worker, frontend, migrations, and local tooling from source.',
		group: 'sty'
	},
	{
		href: '/docs/pig',
		title: 'PIG Overview',
		description: 'Local-first VCS concepts: saves, packs, workspaces, sync, and review.',
		group: 'PIG'
	},
	{
		href: '/docs/pig/concepts',
		title: 'PIG Concepts',
		description: 'Snapshots, trees, object storage, intent extraction, workspaces, and operation log.',
		group: 'PIG'
	},
	{
		href: '/docs/pig/workflow',
		title: 'Daily Workflow',
		description: 'How humans and agents should save, pack, undo, merge, and sync work.',
		group: 'PIG'
	},
	{
		href: '/docs/pig/cli',
		title: 'PIG CLI',
		description: 'Command reference for local work, remotes, review, releases, and signing.',
		group: 'PIG'
	},
	{
		href: '/docs/pig/sync',
		title: 'Sync and Remotes',
		description: 'Remote setup, force sync, partial fetch, object transfer, and server contracts.',
		group: 'PIG'
	},
	{
		href: '/docs/pig/agents',
		title: 'Agents and MCP',
		description: 'Agent operating rules, MCP tools, JSON output, attribution, and safety.',
		group: 'PIG'
	},
	{
		href: '/docs/api',
		title: 'API Overview',
		description: 'The REST shape: auth, pagination, caching, errors, and endpoints.',
		group: 'API'
	},
	{
		href: '/docs/protocol',
		title: 'Remote Protocol',
		description: 'Capability negotiation, object transfer, workspace heads, history, and permissions.',
		group: 'API'
	},
	{
		href: '/docs/api-keys',
		title: 'API Keys',
		description: 'Granular project-scoped tokens for agents and integrations.',
		group: 'API'
	},
	{
		href: '/docs/oauth',
		title: 'OAuth',
		description: 'Developer apps and project authorization for external tools.',
		group: 'API'
	},
	{
		href: '/docs/webhooks',
		title: 'Webhooks',
		description: 'Outbound project events, delivery headers, and signature checks.',
		group: 'API'
	},
	{
		href: '/docs/releases',
		title: 'Releases',
		description: 'Changelog entries, source snapshots, artifacts, and public downloads.',
		group: 'API'
	},
	{
		href: '/docs/agents',
		title: 'Agent Guide',
		description: 'The compact rules agents should follow when working in PIG and sty projects.',
		group: 'Agents'
	},
	{
		href: '/docs/roadmap',
		title: 'Roadmap',
		description: 'What exists now, what is intentionally deferred, and what is still future work.',
		group: 'Agents'
	}
];

export function pageDescription(pathname: string) {
	return docsNav.find((item) => item.href === pathname)?.description ?? docsNav[0].description;
}
