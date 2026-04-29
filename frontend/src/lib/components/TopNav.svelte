<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		getProjectStats,
		getProjectSettings,
		isAbortError,
		starProject,
		unstarProject,
		type ProjectSummary,
		type TenantSummary,
		type ProjectSettings,
		type ProjectStats,
		type NavbarItem
	} from '$lib/api';
	import Star from 'lucide-svelte/icons/star';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Plus from 'lucide-svelte/icons/plus';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import type { AveProfile } from '$lib/session';

	let {
		profile,
		tenants,
		projects,
		onSignOut,
		onCreateProject,
		onCreateOrg,
		busy,
		message
	}: {
		profile: AveProfile | null;
		tenants: TenantSummary[];
		projects: ProjectSummary[];
		onSignOut: () => void;
		onCreateProject: (name: string, tenantName?: string) => Promise<void>;
		onCreateOrg: (name: string) => Promise<void>;
		busy: boolean;
		message: string;
	} = $props();

	let showProfile = $state(false);
	let showTenantMenu = $state(false);
	let showProjectMenu = $state(false);
	let showCreateOrg = $state(false);
	let settings = $state<ProjectSettings | null>(null);
	let stats = $state<ProjectStats | null>(null);
	let settingsLoading = $state(false);
	let settingsKey = '';
	let newProjectName = $state('');
	let newOrgName = $state('');

	const currentPath = $derived($page.url.pathname);
	const pathParts = $derived(currentPath.split('/').filter(Boolean));
	const accountSettings = $derived(pathParts[0] === 'settings');
	const currentTenant = $derived(accountSettings ? '' : (pathParts[0] ?? ''));
	const currentProject = $derived(accountSettings ? null : (pathParts[1] ?? null));
	const selectedTenant = $derived(currentTenant || tenants[0]?.name || profile?.preferredUsername || '');
	const tenantProjects = $derived(projects.filter((p) => p.tenant === selectedTenant));
	const displayName = $derived(profile?.preferredUsername || profile?.name || 'Signed in');
	const profileHandle = $derived(profile?.preferredUsername ? `@${profile.preferredUsername}` : profile?.email);
	const profileDetail = $derived(profileHandle || '');
	const avatarUrl = $derived(profile?.picture);
	const avatarInitials = $derived(initials(displayName));

	const DEFAULT_TABS: NavbarItem[] = [
		{ id: '', label: 'Overview', type: 'tab', enabled: true, order: 0 },
		{ id: 'code', label: 'Code', type: 'tab', enabled: true, order: 1 },
		{ id: 'workspaces', label: 'Workspaces', type: 'tab', enabled: true, order: 2 },
		{ id: 'issues', label: 'Issues', type: 'tab', enabled: true, order: 3 },
		{ id: 'releases', label: 'Releases', type: 'tab', enabled: true, order: 4 },
		{ id: 'automation', label: 'Automation', type: 'tab', enabled: true, order: 5 },
		{ id: 'history', label: 'History', type: 'tab', enabled: true, order: 6 },
		{ id: 'settings', label: 'Settings', type: 'tab', enabled: true, order: 7 }
	];

	function withDefaultTabs(items: NavbarItem[]) {
		const merged = items.filter((item) => item.id !== 'ready');
		for (const tab of DEFAULT_TABS) {
			if (!merged.some((item) => item.id === tab.id)) {
				merged.push({ ...tab, order: merged.length });
			}
		}
		return merged;
	}

	const visibleTabs = $derived(() => {
		const items = settings?.navbar_items?.length ? settings.navbar_items : DEFAULT_TABS;
		return withDefaultTabs(items).filter((t) => t.enabled).sort((a, b) => a.order - b.order);
	});

	const currentTab = $derived(() => {
		if (!currentProject) return null;
		const parts = currentPath.split('/').filter(Boolean);
		if (parts.length < 3) return '';
		const tab = parts[2];
		const tabs = settings?.navbar_items?.length ? settings.navbar_items : DEFAULT_TABS;
		return withDefaultTabs(tabs).find((t) => t.id === tab)?.id ?? '';
	});

	$effect(() => {
		const key = currentTenant && currentProject ? `${currentTenant}/${currentProject}` : '';
		if (!key) {
			settingsKey = '';
			settings = null;
			stats = null;
			return;
		}
		if (key === settingsKey) return;
		settingsKey = key;
		const controller = new AbortController();
		loadProjectChrome(currentTenant, currentProject ?? '', controller.signal);
		return () => controller.abort();
	});

	onMount(() => {
		const handleStatsChanged = (event: Event) => {
			const detail = (event as CustomEvent<{ tenant: string; project: string }>).detail;
			if (!detail || detail.tenant !== currentTenant || detail.project !== currentProject) return;
			void refreshProjectStats(detail.tenant, detail.project);
		};
		window.addEventListener('sty:project-stats-changed', handleStatsChanged);
		return () => window.removeEventListener('sty:project-stats-changed', handleStatsChanged);
	});

	async function loadProjectChrome(tenant: string, project: string, signal?: AbortSignal) {
		settingsLoading = true;
		try {
			const [loadedSettings, loadedStats] = await Promise.all([
				getProjectSettings(tenant, project, signal ? { signal } : {}),
				getProjectStats(tenant, project, signal ? { signal } : {})
			]);
			settings = loadedSettings;
			stats = loadedStats;
		} catch (error) {
			if (isAbortError(error)) return;
			settings = null;
			stats = null;
		} finally {
			if (!signal?.aborted) settingsLoading = false;
		}
	}

	async function refreshProjectStats(tenant: string, project: string) {
		try {
			stats = await getProjectStats(tenant, project);
		} catch {
			return;
		}
	}

	async function handleToggleStar() {
		if (!settings || !currentTenant || !currentProject) return;
		try {
			if (settings.is_starred) {
				await unstarProject(currentTenant, currentProject);
				settings = { ...settings, is_starred: false, starred_count: Math.max(0, settings.starred_count - 1) };
			} else {
				await starProject(currentTenant, currentProject);
				settings = { ...settings, is_starred: true, starred_count: settings.starred_count + 1 };
			}
		} catch {
			return;
		}
	}

	function initials(value: string) {
		const parts = value.trim().split(/\s+/).filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		}
		return (parts[0] ?? value).slice(0, 2).toUpperCase();
	}

	async function createProjectFromMenu() {
		if (!newProjectName.trim()) return;
		const name = newProjectName.trim();
		await onCreateProject(name, selectedTenant);
		newProjectName = '';
		showProjectMenu = false;
	}

	async function createOrgFromModal() {
		if (!newOrgName.trim()) return;
		const name = newOrgName.trim();
		await onCreateOrg(name);
		newOrgName = '';
		showCreateOrg = false;
	}

	function tabCount(id: string) {
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
</script>

<header class="border-b border-[#2a2a28] bg-[#0f0f0d]">
	<div class="flex items-center gap-4 px-32 py-2.5 md:px-48 lg:px-64 xl:px-80">
		<a href="/" class="text-lg font-bold tracking-tight text-[#f0eee4]">sty</a>

		<div class="flex items-center gap-0.5">
			<div class="relative">
				<button
					class="flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#d9a66c]"
					onclick={() => (showTenantMenu = !showTenantMenu)}
				>
					{selectedTenant || 'Tenants'}
					<ChevronDown class="h-3.5 w-3.5 text-[#6f6b5f]" />
				</button>
			{#if showTenantMenu}
				<div class="absolute left-0 top-full z-50 mt-1 w-56 rounded border border-[#2a2a28] bg-[#141412] py-1 shadow-lg">
					{#if tenants.length === 0}
						<p class="px-3 py-2 text-xs text-[#6f6b5f]">No tenants yet.</p>
					{:else}
						{#each tenants as tenant}
							<button
								class="block w-full px-3 py-1.5 text-left text-sm {selectedTenant === tenant.name ? 'text-[#f0eee4]' : 'text-[#a09d94]'} hover:bg-[#1e1e1c]"
								onclick={() => { showTenantMenu = false; goto(`/${tenant.name}`); }}
							>
								{tenant.name}
							</button>
						{/each}
					{/if}
					<button
						class="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs text-[#6f6b5f] hover:bg-[#1e1e1c] hover:text-[#a09d94]"
						onclick={() => { showTenantMenu = false; showCreateOrg = true; }}
					>
						<Plus class="h-3.5 w-3.5" /> New tenant
					</button>
				</div>
			{/if}
		</div>

			{#if currentProject}
				<span class="text-[#5c5c5a]">/</span>
				<div class="relative">
					<button
						class="flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-[#eae9e4] hover:bg-[#1e1e1c] hover:text-[#d9a66c]"
						onclick={() => (showProjectMenu = !showProjectMenu)}
					>
						{currentProject}
						<ChevronDown class="h-3.5 w-3.5 text-[#6f6b5f]" />
					</button>
					{#if showProjectMenu}
						<div class="absolute left-0 top-full z-50 mt-1 w-64 rounded border border-[#2a2a28] bg-[#141412] py-1 shadow-lg">
							<div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5c5c5a]">{selectedTenant} projects</div>
							{#each tenantProjects as p}
								<a
									href="/{p.tenant}/{p.project}"
									class="block px-3 py-1.5 text-sm {currentProject === p.project ? 'text-[#f0eee4]' : 'text-[#a09d94]'} hover:bg-[#1e1e1c]"
									onclick={() => (showProjectMenu = false)}
								>
									{p.project}
								</a>
							{/each}
							{#if tenantProjects.length === 0}
								<p class="px-3 py-1.5 text-xs text-[#6f6b5f]">No projects</p>
							{/if}
							<div class="mt-1 border-t border-[#2a2a28] px-2 pt-2">
								<input
									class="w-full rounded bg-[#0f0f0d] px-2 py-1 text-xs text-[#eae9e4] outline-none"
									placeholder="new project"
									bind:value={newProjectName}
								/>
								<button
									class="mt-1 w-full rounded bg-[#2e2e2c] py-1 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]"
									disabled={busy || !newProjectName.trim()}
									onclick={createProjectFromMenu}
								>
									Create
								</button>
								{#if message}<p class="mt-1 text-[10px] text-[#d96c5a]">{message}</p>{/if}
							</div>
						</div>
					{/if}
				</div>

				{#if settings && !settingsLoading}
				<button
					class="ml-1 flex items-center gap-1 rounded border border-[#2a2a28] px-2 py-0.5 text-xs text-[#a09d94] hover:border-[#d9a66c] hover:text-[#d9a66c]"
					onclick={handleToggleStar}
				>
					<Star class="h-3.5 w-3.5" fill={settings.is_starred ? 'currentColor' : 'none'} />
					<span>{settings.starred_count}</span>
				</button>
				<span class="ml-1.5 rounded border border-[#2a2a28] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#6f6b5f]">
					{settings.visibility}
				</span>
				{/if}
			{/if}
		</div>

		<div class="flex-1"></div>

		<div class="relative">
			<button
				class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4] hover:bg-[#3a3a36]"
				onclick={() => (showProfile = !showProfile)}
			>
				{#if avatarUrl}
					<img src={avatarUrl} alt="" class="h-full w-full object-cover" />
				{:else}
					{avatarInitials}
				{/if}
			</button>
			{#if showProfile}
				<div class="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-[#2a2a28] bg-[#141412] py-1 shadow-lg">
					<div class="px-3 py-2">
						<div class="truncate text-sm text-[#eae9e4]">{displayName}</div>
						{#if profileDetail && profileDetail !== displayName}
							<div class="mt-0.5 truncate text-xs text-[#6f6b5f]">{profileDetail}</div>
						{/if}
					</div>
					<div class="border-t border-[#2a2a28]">
						<a class="block w-full px-3 py-1.5 text-left text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" href="/settings" onclick={() => (showProfile = false)}>
							User settings
						</a>
						<button class="block w-full px-3 py-1.5 text-left text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={() => { onSignOut(); showProfile = false; }}>
							Sign out
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if currentProject}
		<nav class="flex gap-1 px-32 md:px-48 lg:px-64 xl:px-80">
			{#each visibleTabs() as tab}
				{#if tab.type === 'link'}
					{@const href = tab.url ?? '#'}
					{@const isExternal = href.startsWith('http')}
					<a
						href={href}
						class="inline-flex items-center gap-0.5 border-b-2 px-3 py-2 text-sm font-medium border-transparent text-[#8c887e] hover:text-[#d9a66c]"
						{...isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}}
					>
						{tab.label}
						{#if isExternal}
							<ExternalLink class="h-3 w-3" />
						{/if}
					</a>
				{:else}
					{@const href = tab.id ? `/${currentTenant}/${currentProject}/${tab.id}` : `/${currentTenant}/${currentProject}`}
					{@const count = tabCount(tab.id)}
					<a
						{href}
						class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium {currentTab() === tab.id ? 'border-[#d9a66c] text-[#f0eee4]' : 'border-transparent text-[#8c887e] hover:text-[#d9a66c]'}"
					>
						{tab.label}
						{#if count !== null}
							<span class="text-[11px] font-normal text-[#6f6b5f]">{count}</span>
						{/if}
					</a>
				{/if}
			{/each}
		</nav>
	{/if}
</header>

{#if showCreateOrg}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
		<div class="w-full max-w-sm rounded border border-[#2a2a28] bg-[#141412] p-5">
			<h3 class="text-sm font-semibold text-[#f0eee4]">New tenant</h3>
			<input class="mt-3 w-full rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="tenant name" bind:value={newOrgName} />
			<div class="mt-3 flex justify-end gap-2">
				<button class="px-3 py-1.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (showCreateOrg = false)}>Cancel</button>
				<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d]" disabled={busy || !newOrgName.trim()} onclick={createOrgFromModal}>Create</button>
			</div>
			{#if message}<p class="mt-2 text-xs text-[#d96c5a]">{message}</p>{/if}
		</div>
	</div>
{/if}
