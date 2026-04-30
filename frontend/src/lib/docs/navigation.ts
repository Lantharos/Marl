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
		description: 'Pick the right path: use sty, use PIG, or integrate with the API.',
		group: 'Start'
	},
	{
		href: '/docs/getting-started',
		title: 'Getting Started',
		description: 'Install sty, sign in, connect a repository, and sync the first save.',
		group: 'Start'
	},
	{
		href: '/docs/pig',
		title: 'PIG Guide',
		description: 'Local commands for saves, workspaces, stash, signing, and sync.',
		group: 'Work'
	},
	{
		href: '/docs/api',
		title: 'API',
		description: 'The REST shape: auth, pagination, caching, errors, and endpoints.',
		group: 'Build'
	},
	{
		href: '/docs/api-keys',
		title: 'API Keys',
		description: 'Granular project-scoped tokens for agents and integrations.',
		group: 'Build'
	},
	{
		href: '/docs/oauth',
		title: 'OAuth',
		description: 'Developer apps and project authorization for external tools.',
		group: 'Build'
	},
	{
		href: '/docs/webhooks',
		title: 'Webhooks',
		description: 'Outbound project events, delivery headers, and signature checks.',
		group: 'Build'
	},
	{
		href: '/docs/releases',
		title: 'Releases',
		description: 'Changelog entries, source snapshots, artifacts, and public downloads.',
		group: 'Work'
	}
];

export function pageDescription(pathname: string) {
	return docsNav.find((item) => item.href === pathname)?.description ?? docsNav[0].description;
}
