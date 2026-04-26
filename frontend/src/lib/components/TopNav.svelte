<script lang="ts">
	import { page } from '$app/stores';
	import {
		getProjectSettings,
		starProject,
		unstarProject,
		type ProjectSummary,
		type TenantSummary,
		type ProjectSettings,
		type NavbarItem
	} from '$lib/api';
	import Star from 'lucide-svelte/icons/star';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Plus from 'lucide-svelte/icons/plus';

	let {
		user,
		tenants,
		projects,
		onSignOut,
		onCreateProject,
		onCreateOrg,
		onDevLogin,
		projectName,
		orgName,
		busy,
		message,
		devAuthEnabled,
		currentDevUser,
		devUser
	}: {
		user: string;
		tenants: TenantSummary[];
		projects: ProjectSummary[];
		onSignOut: () => void;
		onCreateProject: () => void;
		onCreateOrg: () => void;
		onDevLogin: () => void;
		projectName: string;
		orgName: string;
		busy: boolean;
		message: string;
		devAuthEnabled: boolean;
		currentDevUser: string | null;
		devUser: string;
	} = $props();

	let showProfile = $state(false);
	let showTenantMenu = $state(false);
	let showProjectMenu = $state(false);
	let showCreateOrg = $state(false);
	let tenantName = $state('');
	let settings = $state<ProjectSettings | null>(null);
	let settingsLoading = $state(false);

	const currentPath = $derived($page.url.pathname);
	const pathParts = $derived(currentPath.split('/').filter(Boolean));
	const currentTenant = $derived(pathParts[0] ?? '');
	const currentProject = $derived(pathParts[1] ?? null);
	const tenantProjects = $derived(projects.filter((p) => p.tenant === currentTenant));

	const DEFAULT_TABS: NavbarItem[] = [
		{ id: '', label: 'Overview', type: 'tab', enabled: true, order: 0 },
		{ id: 'code', label: 'Code', type: 'tab', enabled: true, order: 1 },
		{ id: 'workspaces', label: 'Workspaces', type: 'tab', enabled: true, order: 2 },
		{ id: 'issues', label: 'Issues', type: 'tab', enabled: true, order: 3 },
		{ id: 'ready', label: 'Ready', type: 'tab', enabled: true, order: 4 },
		{ id: 'history', label: 'History', type: 'tab', enabled: true, order: 5 },
		{ id: 'settings', label: 'Settings', type: 'tab', enabled: true, order: 6 }
	];

	const visibleTabs = $derived(() => {
		const items = settings?.navbar_items?.length ? settings.navbar_items : DEFAULT_TABS;
		return items.filter((t) => t.enabled).sort((a, b) => a.order - b.order);
	});

	const currentTab = $derived(() => {
		if (!currentProject) return null;
		const parts = currentPath.split('/').filter(Boolean);
		if (parts.length < 3) return '';
		const tab = parts[2];
		const tabs = settings?.navbar_items?.length ? settings.navbar_items : DEFAULT_TABS;
		return tabs.find((t) => t.id === tab)?.id ?? '';
	});

	$effect(() => {
		if (currentTenant && currentProject) {
			loadSettings(currentTenant, currentProject);
		} else {
			settings = null;
		}
	});

	async function loadSettings(tenant: string, project: string) {
		settingsLoading = true;
		try {
			settings = await getProjectSettings(tenant, project);
		} catch {
			settings = null;
		} finally {
			settingsLoading = false;
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
			// ignore
		}
	}
</script>

<header class="border-b border-[#2a2a28] bg-[#0f0f0d]">
	<div class="flex items-center gap-4 px-32 py-2.5 md:px-48 lg:px-64 xl:px-80">
		<a href="/" class="text-lg font-bold tracking-tight text-[#f0eee4]">sty</a>

		{#if currentTenant}
			<div class="flex items-center gap-0.5">
				<div class="relative">
					<button
						class="flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#d9a66c]"
						onclick={() => (showTenantMenu = !showTenantMenu)}
					>
						{currentTenant}
						<span class="text-xs">▼</span>
					</button>
				{#if showTenantMenu}
					<div class="absolute left-0 top-full z-50 mt-1 w-56 rounded border border-[#2a2a28] bg-[#141412] py-1 shadow-lg">
						<div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5c5c5a]">Tenants</div>
						{#each tenants as tenant}
							<a
								href="/{tenant.name}"
								class="block px-3 py-1.5 text-sm {currentTenant === tenant.name ? 'text-[#f0eee4]' : 'text-[#a09d94]'} hover:bg-[#1e1e1c]"
								onclick={() => (showTenantMenu = false)}
							>
								{tenant.name}
							</a>
						{/each}
						<button
							class="flex items-center gap-1 w-full px-3 py-1.5 text-left text-xs text-[#6f6b5f] hover:bg-[#1e1e1c] hover:text-[#a09d94]"
							onclick={() => { showTenantMenu = false; showCreateOrg = true; }}
						>
							<Plus class="h-3.5 w-3.5" /> New org
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
						<span class="text-xs text-[#6f6b5f]">▼</span>
					</button>
					{#if showProjectMenu}
						<div class="absolute left-0 top-full z-50 mt-1 w-64 rounded border border-[#2a2a28] bg-[#141412] py-1 shadow-lg">
							<div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5c5c5a]">{currentTenant} projects</div>
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
									bind:value={projectName}
								/>
								<button
									class="mt-1 w-full rounded bg-[#2e2e2c] py-1 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]"
									disabled={busy || !projectName}
									onclick={() => { tenantName = currentTenant; onCreateProject(); showProjectMenu = false; }}
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
		{/if}

		<div class="flex-1"></div>

		<div class="relative">
			<button
				class="flex h-7 w-7 items-center justify-center rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4] hover:bg-[#3a3a36]"
				onclick={() => (showProfile = !showProfile)}
			>
				{user.slice(0, 2).toUpperCase()}
			</button>
			{#if showProfile}
				<div class="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-[#2a2a28] bg-[#141412] py-1 shadow-lg">
					<div class="px-3 py-2 text-sm text-[#a09d94]">{user}</div>
					<div class="border-t border-[#2a2a28]">
						{#if devAuthEnabled}
							<div class="grid gap-1.5 px-2 py-2">
								<input class="w-full rounded bg-[#0f0f0d] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder={currentDevUser || 'dev'} bind:value={devUser} />
								<button class="w-full rounded bg-[#2e2e2c] py-1 text-xs font-medium text-[#eae9e4]" onclick={() => { onDevLogin(); showProfile = false; }}>
									Dev sign in
								</button>
							</div>
						{/if}
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
					<a
						{href}
						class="border-b-2 px-3 py-2 text-sm font-medium {currentTab() === tab.id ? 'border-[#d9a66c] text-[#f0eee4]' : 'border-transparent text-[#8c887e] hover:text-[#d9a66c]'}"
					>
						{tab.label}
					</a>
				{/if}
			{/each}
		</nav>
	{/if}
</header>

{#if showCreateOrg}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
		<div class="w-full max-w-sm rounded border border-[#2a2a28] bg-[#141412] p-5">
			<h3 class="text-sm font-semibold text-[#f0eee4]">New organization</h3>
			<input class="mt-3 w-full rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="org name" bind:value={orgName} />
			<div class="mt-3 flex justify-end gap-2">
				<button class="px-3 py-1.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (showCreateOrg = false)}>Cancel</button>
				<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d]" disabled={busy || !orgName} onclick={() => { onCreateOrg(); showCreateOrg = false; }}>Create</button>
			</div>
			{#if message}<p class="mt-2 text-xs text-[#d96c5a]">{message}</p>{/if}
		</div>
	</div>
{/if}
