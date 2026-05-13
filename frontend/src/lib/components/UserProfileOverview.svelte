<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		isAbortError,
		listTenantLeavesPage,
		updateUserProfilePins,
		type Leaf,
		type HomeActivityItem,
		type ProjectDiscoveryItem,
		type UserProfilePage
	} from '$lib/api';
	import { profileDisplayName, profileName, userInitials } from '$lib/identity';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import ProfileContributionGraph from '$lib/components/ProfileContributionGraph.svelte';
	import Building2 from 'lucide-svelte/icons/building-2';
	import Check from 'lucide-svelte/icons/check';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import FolderGit2 from 'lucide-svelte/icons/folder-git-2';
	import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
	import Pin from 'lucide-svelte/icons/pin';
	import StickyNote from 'lucide-svelte/icons/sticky-note';
	import X from 'lucide-svelte/icons/x';

	let { profile: profileProp }: { profile: UserProfilePage } = $props();

	let savedProfile = $state<UserProfilePage | null>(null);
	let editingPins = $state(false);
	let selectedPins = $state<string[]>([]);
	let saveBusy = $state(false);
	let saveError = $state('');
	let activeTab = $state<'overview' | 'projects' | 'following' | 'leaves'>('overview');
	let leaves = $state.raw<Leaf[]>([]);
	let leavesTotal = $state(0);
	let leavesNextPage = $state<number | null>(null);
	let leavesLoading = $state(false);
	let leavesLoadingMore = $state(false);
	let leavesError = $state('');
	let leavesLoadedTenant = $state('');
	let leafAbort: AbortController | null = null;

	const profile = $derived(savedProfile ?? profileProp);
	const displayName = $derived(profileDisplayName(profile.profile) || profile.tenant);
	const aveHandle = $derived(profileName(profile.profile));
	const showAveHandle = $derived(Boolean(aveHandle && aveHandle !== profile.tenant));
	const avatar = $derived(profile.profile.avatar_url);
	const pinnedKeys = $derived(profile.pinned_projects.map(projectKey));

	$effect(() => {
		if (savedProfile && savedProfile.tenant !== profileProp.tenant) savedProfile = null;
		if (leavesLoadedTenant && leavesLoadedTenant !== profileProp.tenant) resetLeaves();
	});

	onDestroy(() => {
		leafAbort?.abort();
	});

	function projectKey(project: Pick<ProjectDiscoveryItem, 'tenant' | 'project'>) {
		return `${project.tenant}/${project.project}`;
	}

	function projectPath(project: ProjectDiscoveryItem | HomeActivityItem) {
		return `/${project.tenant}/${project.project}`;
	}

	function projectLabel(project: ProjectDiscoveryItem | HomeActivityItem) {
		return `${project.tenant}/${project.project}`;
	}

	function leafAttachment(leaf: Leaf) {
		return leaf.attached_id ? `${leaf.attached_type}:${leaf.attached_id}` : leaf.attached_type;
	}

	function latest(value?: string | null) {
		if (!value) return 'No recent activity';
		return new Date(value).toLocaleDateString();
	}

	function openPins() {
		selectedPins = pinnedKeys;
		saveError = '';
		editingPins = true;
	}

	function togglePin(project: ProjectDiscoveryItem) {
		const key = projectKey(project);
		if (selectedPins.includes(key)) {
			selectedPins = selectedPins.filter((item) => item !== key);
			return;
		}
		if (selectedPins.length >= 6) return;
		selectedPins = [...selectedPins, key];
	}

	async function savePins() {
		saveBusy = true;
		saveError = '';
		try {
			const projects = selectedPins
				.map((key) => profile.pin_candidates.find((project) => projectKey(project) === key))
				.filter((project): project is ProjectDiscoveryItem => Boolean(project))
				.map((project) => ({ tenant: project.tenant, project: project.project }));
			savedProfile = await updateUserProfilePins(profile.tenant, projects);
			editingPins = false;
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Could not save pins';
		} finally {
			saveBusy = false;
		}
	}

	function activityTime(value: string) {
		return new Date(value).toLocaleString();
	}

	function tabClass(tab: 'overview' | 'projects' | 'following' | 'leaves') {
		return activeTab === tab
			? 'border-[#d9a66c] text-[#f0eee4]'
			: 'border-transparent text-[#8c887e] hover:text-[#eae9e4]';
	}

	function openTab(tab: 'overview' | 'projects' | 'following' | 'leaves') {
		activeTab = tab;
		if (tab === 'leaves') void ensureLeaves();
	}

	function resetLeaves() {
		leafAbort?.abort();
		leafAbort = null;
		leaves = [];
		leavesTotal = 0;
		leavesNextPage = null;
		leavesError = '';
		leavesLoadedTenant = '';
		leavesLoading = false;
		leavesLoadingMore = false;
	}

	async function ensureLeaves() {
		if (leavesLoadedTenant === profile.tenant || leavesLoading) return;
		await loadLeaves(1);
	}

	async function loadLeaves(page = 1) {
		const requestTenant = profile.tenant;
		if (page === 1) {
			leafAbort?.abort();
			leafAbort = new AbortController();
			leavesLoading = true;
		} else {
			if (leavesLoadingMore) return;
			leavesLoadingMore = true;
		}
		leavesError = '';
		try {
			const result = await listTenantLeavesPage(requestTenant, {
				page,
				perPage: 20,
				signal: page === 1 ? leafAbort?.signal : undefined
			});
			if (requestTenant !== profile.tenant) return;
			if (page === 1) {
				leaves = result.items;
				leavesLoadedTenant = requestTenant;
			} else {
				const seen = new Set(leaves.map((leaf) => leaf.id));
				leaves = [...leaves, ...result.items.filter((leaf) => !seen.has(leaf.id))];
			}
			leavesTotal = result.total;
			leavesNextPage = result.next;
		} catch (error) {
			if (isAbortError(error)) return;
			leavesError = error instanceof Error ? error.message : 'Could not load leaves';
		} finally {
			if (page === 1 && requestTenant === profile.tenant) leavesLoading = false;
			if (page !== 1) leavesLoadingMore = false;
		}
	}
</script>

<div class="mb-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
	<aside class="min-w-0">
		<div class="flex items-center gap-4 lg:block">
			{#if avatar}
				<img class="h-24 w-24 shrink-0 rounded object-cover lg:h-44 lg:w-44" src={avatar} alt="" />
			{:else}
				<div class="grid h-24 w-24 shrink-0 place-items-center rounded bg-[#1a1a18] text-2xl font-semibold text-[#d9a66c] lg:h-44 lg:w-44 lg:text-4xl">
					{userInitials(profile.owner, profile.profile)}
				</div>
			{/if}
			<div class="min-w-0 lg:mt-4">
				<h1 class="truncate text-2xl font-semibold text-[#f0eee4]">{displayName}</h1>
				<p class="truncate text-sm text-[#8c887e]">/{profile.tenant}</p>
				{#if showAveHandle}
					<p class="truncate text-sm text-[#6f6b5f]">@{aveHandle}</p>
				{/if}
			</div>
		</div>

		<div class="mt-6 grid grid-cols-3 gap-3 text-sm lg:grid-cols-1">
			<div>
				<div class="font-medium text-[#f0eee4]">{profile.stats.public_project_count}</div>
				<div class="text-xs text-[#6f6b5f]">public projects</div>
			</div>
			<div>
				<div class="font-medium text-[#f0eee4]">{profile.stats.contribution_count}</div>
				<div class="text-xs text-[#6f6b5f]">contributions</div>
			</div>
			<div>
				<div class="font-medium text-[#f0eee4]">{profile.stats.tenant_count}</div>
				<div class="text-xs text-[#6f6b5f]">tenants</div>
			</div>
		</div>

		{#if profile.tenants.length > 0}
			<div class="mt-6 border-t border-[#2a2a28] pt-5">
				<h2 class="text-sm font-medium text-[#f0eee4]">Tenants</h2>
				<div class="mt-3 space-y-2">
					{#each profile.tenants as tenant (tenant.name)}
						<a class="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" href={`/${tenant.name}`}>
							<span class="flex min-w-0 items-center gap-2">
								<Building2 class="h-4 w-4 shrink-0 text-[#6f6b5f]" />
								<span class="truncate">{tenant.name}</span>
							</span>
							<span class="shrink-0 text-xs text-[#6f6b5f]">{tenant.public_project_count}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}
	</aside>

	<section class="min-w-0">
		<div class="border-b border-[#2a2a28]">
			<div class="flex gap-5">
				<button class="border-b py-2 text-sm font-medium {tabClass('overview')}" onclick={() => openTab('overview')}>
					Overview
				</button>
				<button class="border-b py-2 text-sm font-medium {tabClass('projects')}" onclick={() => openTab('projects')}>
					Projects <span class="ml-1 text-xs text-[#6f6b5f]">{profile.projects.length}</span>
				</button>
				<button class="border-b py-2 text-sm font-medium {tabClass('following')}" onclick={() => openTab('following')}>
					Following <span class="ml-1 text-xs text-[#6f6b5f]">{profile.following.length}</span>
				</button>
				<button class="border-b py-2 text-sm font-medium {tabClass('leaves')}" onclick={() => openTab('leaves')}>
					Leaves {#if leavesLoadedTenant === profile.tenant}<span class="ml-1 text-xs text-[#6f6b5f]">{leavesTotal}</span>{/if}
				</button>
			</div>
		</div>

		{#if activeTab === 'overview'}
			<div class="mt-5 flex items-center justify-between gap-3">
				<h2 class="text-sm font-medium text-[#f0eee4]">Pinned projects</h2>
				{#if profile.is_self}
					<button class="rounded px-2 py-1 text-xs text-[#8c887e] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={openPins}>
						Edit pins
					</button>
				{/if}
			</div>
			{#if profile.pinned_projects.length > 0}
				<div class="mt-3 grid gap-3 md:grid-cols-2">
					{#each profile.pinned_projects as project (projectKey(project))}
						<a class="rounded border border-[#2a2a28] bg-[#141412] p-4 hover:border-[#3a3a36] hover:bg-[#1a1a18]" href={projectPath(project)}>
							<div class="flex items-center gap-2 text-sm font-medium text-[#f0eee4]">
								<FolderGit2 class="h-4 w-4 shrink-0 text-[#8c887e]" />
								<span class="truncate">{projectLabel(project)}</span>
							</div>
							<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6f6b5f]">
								<span>{project.stats.history_count} saves</span>
								<span>{project.stats.open_issue_count} issues</span>
								<span>{project.stats.release_count} releases</span>
							</div>
							<div class="mt-4 text-xs text-[#6f6b5f]">{latest(project.last_activity_at)}</div>
						</a>
					{/each}
				</div>
			{:else}
				<div class="mt-3 rounded border border-[#2a2a28] bg-[#141412] p-6 text-sm text-[#8c887e]">
					No public pinned projects yet.
				</div>
			{/if}

			<div class="mt-6">
				<ProfileContributionGraph days={profile.contributions} />
			</div>

			{#if profile.activity.length > 0}
				<div class="mt-6">
					<h2 class="text-sm font-medium text-[#f0eee4]">Recent activity</h2>
					<div class="mt-3 overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
						{#each profile.activity.slice(0, 8) as item (`${item.href}:${item.timestamp}`)}
							<a class="flex gap-3 border-b border-[#252522] px-4 py-3 last:border-b-0 hover:bg-[#1a1a18]" href={item.href}>
								<GitCommitHorizontal class="mt-0.5 h-4 w-4 shrink-0 text-[#d9a66c]" />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm text-[#f0eee4]">{item.title}</span>
									<span class="mt-1 block truncate text-xs text-[#6f6b5f]">
										{projectLabel(item)}{item.workspace ? ` / ${item.workspace}` : ''} / {activityTime(item.timestamp)}
									</span>
								</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		{:else if activeTab === 'projects'}
			{#if profile.projects.length > 0}
				<div class="mt-5 grid gap-3 md:grid-cols-2">
					{#each profile.projects as project (projectKey(project))}
						<a class="rounded border border-[#2a2a28] bg-[#141412] p-4 hover:border-[#3a3a36] hover:bg-[#1a1a18]" href={projectPath(project)}>
							<div class="flex items-center gap-2 text-sm font-medium text-[#f0eee4]">
								<FolderGit2 class="h-4 w-4 shrink-0 text-[#8c887e]" />
								<span class="truncate">{projectLabel(project)}</span>
							</div>
							<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6f6b5f]">
								<span>{project.stats.history_count} saves</span>
								<span>{project.stats.open_issue_count} issues</span>
								<span>{project.stats.release_count} releases</span>
							</div>
							<div class="mt-4 text-xs text-[#6f6b5f]">{latest(project.last_activity_at)}</div>
						</a>
					{/each}
				</div>
			{:else}
				<div class="mt-5 rounded border border-[#2a2a28] bg-[#141412] p-6 text-sm text-[#8c887e]">
					No public projects yet.
				</div>
			{/if}
		{:else if activeTab === 'following'}
			{#if profile.following.length > 0}
				<div class="mt-5 grid gap-3 md:grid-cols-2">
					{#each profile.following as project (projectKey(project))}
						<a class="rounded border border-[#2a2a28] bg-[#141412] p-4 hover:border-[#3a3a36] hover:bg-[#1a1a18]" href={projectPath(project)}>
							<div class="flex items-center gap-2 text-sm font-medium text-[#f0eee4]">
								<FolderGit2 class="h-4 w-4 shrink-0 text-[#8c887e]" />
								<span class="truncate">{projectLabel(project)}</span>
							</div>
							<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6f6b5f]">
								<span>{project.stats.history_count} saves</span>
								<span>{project.stats.open_issue_count} issues</span>
								<span>{project.stats.release_count} releases</span>
							</div>
							<div class="mt-4 text-xs text-[#6f6b5f]">{latest(project.last_activity_at)}</div>
						</a>
					{/each}
				</div>
			{:else}
				<div class="mt-5 rounded border border-[#2a2a28] bg-[#141412] p-6 text-sm text-[#8c887e]">
					No followed public projects.
				</div>
			{/if}
		{:else}
			<div class="mt-5 border border-[#2a2a28] bg-[#0f0f0d]">
				<div class="flex min-h-11 items-center justify-between border-b border-[#2a2a28] bg-[#141412] px-4 text-sm text-[#a09d94]">
					<div>
						<span class="text-[#eae9e4]">Leaves</span>
						{#if leavesLoadedTenant === profile.tenant}<span class="ml-1 text-xs text-[#6f6b5f]">{leavesTotal}</span>{/if}
					</div>
					{#if profile.is_self}
						<a class="text-xs text-[#8c887e] hover:text-[#d9a66c]" href={`/${profile.tenant}/leaves`}>Manage</a>
					{:else}
						<a class="text-xs text-[#8c887e] hover:text-[#d9a66c]" href={`/${profile.tenant}/leaves`}>Open</a>
					{/if}
				</div>
				{#if leavesLoading}
					<div class="px-4 py-10 text-center text-sm text-[#6f6b5f]">Loading leaves...</div>
				{:else if leavesError}
					<div class="px-4 py-5 text-sm text-[#d96c5a]">{leavesError}</div>
				{:else}
					{#each leaves as leaf (leaf.id)}
						<a class="group grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#252522] px-4 py-3 last:border-b-0 hover:bg-[#1a1a18]" href={leaf.href}>
							<div class="grid h-8 w-8 shrink-0 place-items-center bg-[#1e1e1c] text-[#d9a66c]">
								<StickyNote class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<div class="flex min-w-0 items-center gap-2">
									<span class="truncate text-sm font-medium text-[#eae9e4]">{leaf.title}</span>
									{#if leaf.pinned}<Pin class="h-3.5 w-3.5 shrink-0 text-[#d9a66c]" />{/if}
								</div>
								<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8c887e]">
									<span>{leaf.visibility}</span>
									<span>{leafAttachment(leaf)}</span>
									<span>updated {latest(leaf.updated_at)}</span>
									{#each leaf.tags.slice(0, 3) as tag (tag)}
										<span class="text-[#d9a66c]">#{tag}</span>
									{/each}
								</div>
							</div>
							<ChevronRight class="h-4 w-4 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
						</a>
					{:else}
						<div class="px-4 py-10 text-center text-sm text-[#6f6b5f]">No visible leaves yet.</div>
					{/each}
				{/if}
			</div>
			<InfiniteLoader active={Boolean(leavesNextPage)} onVisible={() => loadLeaves(leavesNextPage ?? 1)} />
		{/if}
	</section>
</div>

{#if editingPins}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
		<div class="w-full max-w-lg rounded border border-[#2a2a28] bg-[#141412] shadow-lg">
			<div class="flex items-center justify-between gap-3 border-b border-[#2a2a28] px-4 py-3">
				<div>
					<h3 class="text-sm font-semibold text-[#f0eee4]">Edit pinned projects</h3>
					<p class="mt-1 text-xs text-[#6f6b5f]">{selectedPins.length} of 6 selected</p>
				</div>
				<button class="grid h-8 w-8 place-items-center rounded text-[#8c887e] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={() => (editingPins = false)}>
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="max-h-96 overflow-y-auto p-3">
				{#each profile.pin_candidates as project (projectKey(project))}
					<button class="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-[#1e1e1c]" onclick={() => togglePin(project)}>
						<span class="grid h-5 w-5 shrink-0 place-items-center rounded border border-[#3a3a36] text-[#eae9e4]">
							{#if selectedPins.includes(projectKey(project))}
								<Check class="h-3.5 w-3.5" />
							{/if}
						</span>
						<Pin class="h-4 w-4 shrink-0 text-[#6f6b5f]" />
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm text-[#f0eee4]">{projectLabel(project)}</span>
							<span class="mt-0.5 block text-xs text-[#6f6b5f]">{project.stats.history_count} saves</span>
						</span>
					</button>
				{/each}
			</div>
			{#if saveError}
				<p class="px-4 text-sm text-[#d96c5a]">{saveError}</p>
			{/if}
			<div class="flex justify-end gap-2 border-t border-[#2a2a28] px-4 py-3">
				<button class="rounded px-3 py-1.5 text-sm text-[#8c887e] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" disabled={saveBusy} onclick={() => (editingPins = false)}>
					Cancel
				</button>
				<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={saveBusy} onclick={savePins}>
					Save pins
				</button>
			</div>
		</div>
	</div>
{/if}
