import type { NavbarItem, ProjectStats } from './api';

export const DEFAULT_PROJECT_TABS: NavbarItem[] = [
	{ id: '', label: 'Overview', type: 'tab', enabled: true, order: 0 },
	{ id: 'code', label: 'Code', type: 'tab', enabled: true, order: 1 },
	{ id: 'workspaces', label: 'Workspaces', type: 'tab', enabled: true, order: 2 },
	{ id: 'issues', label: 'Issues', type: 'tab', enabled: true, order: 3 },
	{ id: 'releases', label: 'Releases', type: 'tab', enabled: true, order: 4 },
	{ id: 'automation', label: 'Automation', type: 'tab', enabled: true, order: 5 },
	{ id: 'history', label: 'History', type: 'tab', enabled: true, order: 6 },
	{ id: 'settings', label: 'Settings', type: 'tab', enabled: true, order: 7 }
];

const PUBLIC_PROJECT_TAB_IDS = new Set(['', 'code', 'workspaces', 'issues', 'releases', 'history']);

export function mergeProjectTabs(items: NavbarItem[]) {
	const merged = items.filter((item) => item.id !== 'ready');
	for (const tab of DEFAULT_PROJECT_TABS) {
		if (!merged.some((item) => item.id === tab.id)) {
			merged.push({ ...tab, order: merged.length });
		}
	}
	return merged;
}

export function projectTabs(items: NavbarItem[] | undefined, mode: 'public' | 'private') {
	return mergeProjectTabs(items?.length ? items : DEFAULT_PROJECT_TABS)
		.filter((tab) => tab.enabled)
		.filter((tab) => mode === 'private' || tab.type === 'link' || PUBLIC_PROJECT_TAB_IDS.has(tab.id))
		.sort((a, b) => a.order - b.order);
}

export function projectTabCount(stats: ProjectStats | null | undefined, id: string) {
	if (!stats) return null;
	switch (id) {
		case 'workspaces':
			return stats.workspace_count;
		case 'issues':
			return stats.open_issue_count;
		case 'releases':
			return stats.release_count;
		case 'history':
			return stats.history_count;
		default:
			return null;
	}
}
