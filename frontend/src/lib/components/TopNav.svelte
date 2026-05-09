<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		getProjectStats,
		getProjectFollow,
		isAbortError,
		followProject,
		unfollowProject,
		type AccessResponse,
		type ProjectSummary,
		type TenantSummary,
		type ProjectSettings,
		type ProjectStats,
		type FollowResponse
	} from '$lib/api';
	import { projectTabCount, projectTabs } from '$lib/projectChrome';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Plus from 'lucide-svelte/icons/plus';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import type { AveProfile } from '$lib/session';

	let {
		profile,
		tenants,
		projects,
		onSignOut,
		onCreateOrg,
		busy,
		message
	}: {
		profile: AveProfile | null;
		tenants: TenantSummary[];
		projects: ProjectSummary[];
		onSignOut: () => void;
		onCreateOrg: (name: string) => Promise<void>;
		busy: boolean;
		message: string;
	} = $props();

	let showProfile = $state(false);
	let showTenantMenu = $state(false);
	let showProjectMenu = $state(false);
	let showCreateOrg = $state(false);
	let follow = $state<FollowResponse | null>(null);
	let statsOverride = $state<ProjectStats | null>(null);
	let followLoading = $state(false);
	let settingsKey = '';
	let newOrgName = $state('');

	const currentPath = $derived($page.url.pathname);
	const pathParts = $derived(currentPath.split('/').filter(Boolean));
	const homePage = $derived(pathParts.length === 0);
	const accountSettings = $derived(pathParts[0] === 'settings');
	const currentTenant = $derived(accountSettings ? '' : (pathParts[0] ?? ''));
	const currentProject = $derived(accountSettings ? null : (pathParts[1] ?? null));
	const userTenant = $derived(tenants.find((tenant) => tenant.kind === 'user')?.name ?? '');
	const selectedTenant = $derived(homePage || accountSettings ? '' : currentTenant || tenants[0]?.name || userTenant || profile?.preferredUsername || '');
	const tenantProjects = $derived(projects.filter((p) => p.tenant === selectedTenant));
	const currentProjectSummary = $derived(projects.find((p) => p.tenant === currentTenant && p.project === currentProject));
	const displayName = $derived(userTenant || profile?.preferredUsername || profile?.name || 'Signed in');
	const profileHandle = $derived(profile?.preferredUsername ? `@${profile.preferredUsername}` : profile?.email);
	const profileDetail = $derived(profileHandle || '');
	const avatarUrl = $derived(profile?.picture);
	const avatarInitials = $derived(initials(displayName));
	const projectChrome = $derived(
		($page.data as {
			projectChrome?: {
				settings: ProjectSettings | null;
				stats: ProjectStats | null;
				access: AccessResponse | null;
			};
		}).projectChrome ?? null
	);
	const settings = $derived(projectChrome?.settings ?? null);
	const stats = $derived(statsOverride ?? projectChrome?.stats ?? null);
	const access = $derived(projectChrome?.access ?? null);

	const visibleTabs = $derived(() => {
		return projectTabs(settings?.navbar_items, access?.can_maintain ? 'private' : 'public');
	});

	const currentTab = $derived(() => {
		if (!currentProject) return null;
		const parts = currentPath.split('/').filter(Boolean);
		if (parts.length < 3) return '';
		const tab = parts[2];
		return projectTabs(settings?.navbar_items, access?.can_maintain ? 'private' : 'public').find((t) => t.id === tab)?.id ?? '';
	});

	$effect(() => {
		const key = currentTenant && currentProject ? `${currentTenant}/${currentProject}` : '';
		if (!key) {
			settingsKey = '';
			follow = null;
			statsOverride = null;
			currentProjectAccess.set(null);
			return;
		}
		if (key === settingsKey) return;
		settingsKey = key;
		follow = null;
		statsOverride = null;
		const controller = new AbortController();
		loadProjectFollow(currentTenant, currentProject ?? '', controller.signal);
		return () => controller.abort();
	});

	$effect(() => {
		currentProjectAccess.set(currentProject ? access : null);
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

	async function loadProjectFollow(tenant: string, project: string, signal?: AbortSignal) {
		followLoading = true;
		try {
			follow = await getProjectFollow(tenant, project, signal ? { signal } : {}).catch(() => null);
		} catch (error) {
			if (isAbortError(error)) return;
			follow = null;
		} finally {
			if (!signal?.aborted) followLoading = false;
		}
	}

	async function refreshProjectStats(tenant: string, project: string) {
		try {
			statsOverride = await getProjectStats(tenant, project);
		} catch {
			return;
		}
	}

	async function handleToggleFollow() {
		if (!follow || !currentTenant || !currentProject) return;
		try {
			if (follow.is_following) {
				follow = await unfollowProject(currentTenant, currentProject);
			} else {
				follow = await followProject(currentTenant, currentProject);
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

	function projectMenuLabel(project: ProjectSummary) {
		return project.folder ? `${project.folder}/${project.project}` : project.project;
	}

	async function createOrgFromModal() {
		if (!newOrgName.trim()) return;
		const name = newOrgName.trim();
		await onCreateOrg(name);
		newOrgName = '';
		showCreateOrg = false;
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
					{homePage ? 'Home' : selectedTenant || 'Tenants'}
					<ChevronDown class="h-3.5 w-3.5 text-[#6f6b5f]" />
				</button>
			{#if showTenantMenu}
				<div class="absolute left-0 top-full z-50 mt-1 w-56 rounded border border-[#2a2a28] bg-[#141412] py-1 shadow-lg">
					{#if tenants.length === 0}
						<p class="px-3 py-2 text-xs text-[#6f6b5f]">No tenants yet.</p>
					{:else}
						{#each tenants as tenant}
							<button
								class="block w-full px-3 py-1.5 text-left text-sm {!homePage && selectedTenant === tenant.name ? 'text-[#f0eee4]' : 'text-[#a09d94]'} hover:bg-[#1e1e1c]"
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
						{currentProjectSummary ? projectMenuLabel(currentProjectSummary) : currentProject}
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
									{projectMenuLabel(p)}
								</a>
							{/each}
							{#if tenantProjects.length === 0}
								<p class="px-3 py-1.5 text-xs text-[#6f6b5f]">No projects</p>
							{/if}
						</div>
					{/if}
				</div>

				{#if follow?.can_follow && !followLoading}
				<button
					class="ml-1 rounded border px-2.5 py-1 text-xs font-medium {follow.is_following ? 'border-[#d9a66c] bg-[#1a1712] text-[#d9a66c] hover:bg-[#211d16]' : 'border-[#2a2a28] text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]'}"
					onclick={handleToggleFollow}
				>
					{follow.is_following ? 'Following' : 'Follow'}
				</button>
				{/if}
				{#if settings}
				{#if settings.visibility === 'private'}
					<span class="ml-1.5 rounded border border-[#2a2a28] px-1.5 py-0.5 text-[11px] text-[#6f6b5f]">
						Private
					</span>
				{/if}
				{#if settings.archived_at}
					<span class="ml-1 rounded border border-[#2a2a28] px-1.5 py-0.5 text-[11px] text-[#8c887e]">
						Archived
					</span>
				{/if}
				{/if}
			{/if}
		</div>

		<div class="flex-1"></div>

		<div class="relative">
			<button
				class="group flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border text-[11px] font-medium text-[#eae9e4] transition {showProfile ? 'border-[#3a3a36] bg-[#1e1e1c]' : 'border-transparent bg-[#2a2a28] hover:border-[#3a3a36] hover:bg-[#3a3a36]'} focus-visible:border-[#d9a66c] focus-visible:outline-none"
				aria-label="Open user menu"
				aria-expanded={showProfile}
				title="User menu"
				onclick={() => (showProfile = !showProfile)}
			>
				{#if avatarUrl}
					<img src={avatarUrl} alt="" class="h-full w-full object-cover transition group-hover:opacity-80" />
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
					{@const count = projectTabCount(stats, tab.id)}
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
