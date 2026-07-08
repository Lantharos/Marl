<script lang="ts">
	import { onMount } from 'svelte';
	import { createLabel, getProjectSettings, listLabels, listMilestones, listProjects, listWorkspaceStatuses, searchUsers, type IssueType, type Label, type Milestone, type ProjectComponent, type ProjectSummary, type UserProfile, type WorkspaceStatus } from '$lib/api';
	import UserAvatar from './UserAvatar.svelte';
	import UserProfileLink from './UserProfileLink.svelte';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import BellOff from 'lucide-svelte/icons/bell-off';
	import CirclePlus from 'lucide-svelte/icons/circle-plus';
	import Link2 from 'lucide-svelte/icons/link-2';
	import Lock from 'lucide-svelte/icons/lock';
	import Pin from 'lucide-svelte/icons/pin';
	import Search from 'lucide-svelte/icons/search';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Unlock from 'lucide-svelte/icons/unlock';

	type Patch = { labels?: string[]; components?: string[]; assignees?: string[]; milestone?: string | null; issue_type?: IssueType | null; workspace?: string | null; close_issue?: boolean; locked?: boolean; pinned?: boolean };
	type Participant = { user: string; profile?: UserProfile | null };
	type IssueTypeOption = { value: IssueType; label: string; description: string; color: string };

	const issueTypes: IssueTypeOption[] = [
		{ value: 'bug', label: 'Bug', description: 'An unexpected problem or behavior', color: '#d96c5a' },
		{ value: 'feature', label: 'Feature', description: 'Request, idea, or new functionality', color: '#4a90d9' },
		{ value: 'task', label: 'Task', description: 'A specific piece of work', color: '#d9a66c' }
	];

	let {
		tenant,
		project,
		labels: selectedLabels,
		components: selectedComponents = [],
		assignees,
		milestone,
		issueType = null,
		workspace = null,
		canWrite,
		canMaintain = false,
		locked = false,
		pinned = false,
		participants = [],
		mode = 'issue',
		onChange,
		onTransfer,
		onDelete
	}: {
		tenant: string;
		project: string;
		labels: string[];
		components?: string[];
		assignees: string[];
		milestone: string | null;
		issueType?: IssueType | null;
		workspace?: string | null;
		canWrite: boolean;
		canMaintain?: boolean;
		locked?: boolean;
		pinned?: boolean;
		participants?: Participant[];
		mode?: 'issue' | 'new';
		onChange: (patch: Patch) => Promise<void> | void;
		onTransfer?: (tenant: string, project: string) => Promise<void> | void;
		onDelete?: () => Promise<void> | void;
	} = $props();

	let openPanel = $state('');
	let labelFilter = $state('');
	let userFilter = $state('');
	let typeFilter = $state('');
	let milestoneFilter = $state('');
	let workspaceFilter = $state('');
	let projectFilter = $state('');
	let labels = $state.raw<Label[]>([]);
	let milestones = $state.raw<Milestone[]>([]);
	let users = $state.raw<UserProfile[]>([]);
	let workspaces = $state.raw<WorkspaceStatus[]>([]);
	let projectComponents = $state.raw<ProjectComponent[]>([]);
	let projects = $state.raw<ProjectSummary[]>([]);
	let busy = $state(false);
	let subscribed = $state(true);
	let root = $state<HTMLElement | null>(null);
	let deleteArmed = $state(false);
	let terminalWorkspaceArmed = $state('');
	let userSearchController: AbortController | null = null;
	let userSearchTimer: ReturnType<typeof setTimeout> | null = null;
	const loadControllers = new Set<AbortController>();
	let labelsLoaded = false;
	let labelsLoading = false;
	let milestonesLoaded = false;
	let milestonesLoading = false;
	let workspacesLoaded = false;
	let workspacesLoading = false;
	let componentsLoaded = false;
	let componentsLoading = false;
	let projectsLoaded = false;
	let projectsLoading = false;
	let usersLoaded = false;
	let resourceKey = '';
	const filteredLabels = $derived(labels.filter((label) => label.name.toLowerCase().includes(labelFilter.trim().toLowerCase())));
	const filteredMilestones = $derived(milestones.filter((item) => item.title.toLowerCase().includes(milestoneFilter.trim().toLowerCase())));
	const userChoices = $derived(mergedUserChoices(users, participants));
	const filteredUsers = $derived(userChoices.filter((user) => personLabel(user).toLowerCase().includes(userFilter.trim().toLowerCase())));
	const filteredIssueTypes = $derived(issueTypes.filter((type) => `${type.label} ${type.description}`.toLowerCase().includes(typeFilter.trim().toLowerCase())));
	const filteredWorkspaces = $derived(workspaces.filter((item) => item.name !== 'main' && item.status !== 'deleted').filter((item) => item.name.toLowerCase().includes(workspaceFilter.trim().toLowerCase())));
	const visibleComponents = $derived(projectComponents.filter((component) => component.visible !== false));
	const visibleWorkspaces = $derived(filteredWorkspaces.slice(0, 10));
	const filteredProjects = $derived(projects.filter((item) => `${item.tenant}/${item.project}`.toLowerCase().includes(projectFilter.trim().toLowerCase()) && !(item.tenant === tenant && item.project === project)));
	const selectedIssueType = $derived(issueTypes.find((type) => type.value === issueType) ?? null);
	const selectedWorkspace = $derived(workspaces.find((item) => item.name === workspace) ?? null);
	const exactLabel = $derived(labels.find((label) => label.name.toLowerCase() === labelFilter.trim().toLowerCase()));

	onMount(() => {
		function closePanel(event: PointerEvent) {
			if (!openPanel || !root) return;
			if (!root.contains(event.target as Node)) openPanel = '';
		}
		document.addEventListener('pointerdown', closePanel, true);
		return () => {
			if (userSearchTimer) clearTimeout(userSearchTimer);
			userSearchController?.abort();
			for (const controller of loadControllers) controller.abort();
			document.removeEventListener('pointerdown', closePanel, true);
		};
	});

	$effect(() => {
		const key = `${tenant}/${project}`;
		if (resourceKey === key) return;
		resourceKey = key;
		if (userSearchTimer) clearTimeout(userSearchTimer);
		userSearchTimer = null;
		userSearchController?.abort();
		userSearchController = null;
		for (const controller of loadControllers) controller.abort();
		loadControllers.clear();
		labels = [];
		milestones = [];
		users = [];
		workspaces = [];
		projectComponents = [];
		projects = [];
		labelsLoaded = false;
		labelsLoading = false;
		milestonesLoaded = false;
		milestonesLoading = false;
		workspacesLoaded = false;
		workspacesLoading = false;
		componentsLoaded = false;
		componentsLoading = false;
		projectsLoaded = false;
		projectsLoading = false;
		usersLoaded = false;
		openPanel = '';
	});

	$effect(() => {
		if (selectedLabels.length > 0) void ensureLabels();
	});

	$effect(() => {
		if (selectedComponents.length > 0) void ensureComponents();
	});

	function ignoreAbort(error: unknown) {
		if (!(error instanceof Error) || !error.name.includes('Abort')) console.warn(error);
	}

	function togglePanel(panel: string) {
		if (!canWrite) return;
		openPanel = openPanel === panel ? '' : panel;
		if (openPanel === 'assignees' && !usersLoaded) void refreshUsers(userFilter);
		if (openPanel === 'labels') void ensureLabels();
		if (openPanel === 'components') void ensureComponents();
		if (openPanel === 'milestone') void ensureMilestones();
		if (openPanel === 'development') void ensureWorkspaces();
		if (openPanel === 'transfer') void ensureProjects();
	}

	function trackController() {
		const controller = new AbortController();
		loadControllers.add(controller);
		return controller;
	}

	function releaseController(controller: AbortController) {
		loadControllers.delete(controller);
	}

	async function ensureLabels() {
		if (labelsLoaded || labelsLoading) return;
		labelsLoading = true;
		const controller = trackController();
		try {
			labels = await listLabels(tenant, project, { signal: controller.signal });
			labelsLoaded = true;
		} catch (error) {
			ignoreAbort(error);
		} finally {
			labelsLoading = false;
			releaseController(controller);
		}
	}

	async function ensureMilestones() {
		if (milestonesLoaded || milestonesLoading) return;
		milestonesLoading = true;
		const controller = trackController();
		try {
			milestones = await listMilestones(tenant, project, { signal: controller.signal });
			milestonesLoaded = true;
		} catch (error) {
			ignoreAbort(error);
		} finally {
			milestonesLoading = false;
			releaseController(controller);
		}
	}

	async function ensureWorkspaces() {
		if (workspacesLoaded || workspacesLoading) return;
		workspacesLoading = true;
		const controller = trackController();
		try {
			workspaces = await listWorkspaceStatuses(tenant, project, { signal: controller.signal });
			workspacesLoaded = true;
		} catch (error) {
			ignoreAbort(error);
		} finally {
			workspacesLoading = false;
			releaseController(controller);
		}
	}

	async function ensureComponents() {
		if (componentsLoaded || componentsLoading) return;
		componentsLoading = true;
		const controller = trackController();
		try {
			const settings = await getProjectSettings(tenant, project, { signal: controller.signal });
			projectComponents = settings.components ?? [];
			componentsLoaded = true;
		} catch (error) {
			ignoreAbort(error);
		} finally {
			componentsLoading = false;
			releaseController(controller);
		}
	}

	async function ensureProjects() {
		if (projectsLoaded || projectsLoading) return;
		projectsLoading = true;
		const controller = trackController();
		try {
			projects = await listProjects({ signal: controller.signal });
			projectsLoaded = true;
		} catch (error) {
			ignoreAbort(error);
		} finally {
			projectsLoading = false;
			releaseController(controller);
		}
	}

	function personLabel(profile: UserProfile) {
		return profile.display_name?.trim() || profile.handle?.trim() || profile.user;
	}

	function personProfile(user: string) {
		return userChoices.find((item) => item.user === user) ?? null;
	}

	function mergedUserChoices(searchResults: UserProfile[], timelineParticipants: Participant[]) {
		const byUser = new Map<string, UserProfile>();
		for (const participant of timelineParticipants) {
			if (participant.profile) byUser.set(participant.user, participant.profile);
		}
		for (const user of searchResults) byUser.set(user.user, user);
		return [...byUser.values()];
	}

	function color(value: string) {
		return value.startsWith('#') ? value : `#${value}`;
	}

	async function save(patch: Patch) {
		busy = true;
		try {
			await onChange(patch);
			openPanel = '';
			deleteArmed = false;
			terminalWorkspaceArmed = '';
		} finally {
			busy = false;
		}
	}

	async function transfer(target: ProjectSummary) {
		if (!onTransfer) return;
		busy = true;
		try {
			await onTransfer(target.tenant, target.project);
			openPanel = '';
		} finally {
			busy = false;
		}
	}

	async function deleteIssue() {
		if (!onDelete) return;
		if (!deleteArmed) {
			deleteArmed = true;
			return;
		}
		busy = true;
		try {
			await onDelete();
		} finally {
			busy = false;
		}
	}

	async function refreshUsers(query = userFilter, signal?: AbortSignal) {
		if (!signal) {
			userSearchController?.abort();
			userSearchController = new AbortController();
			signal = userSearchController.signal;
		}
		try {
			const page = await searchUsers(query, { signal, perPage: 20 });
			users = page.items;
			usersLoaded = true;
		} catch (error) {
			ignoreAbort(error);
		}
	}

	async function toggleLabel(label: string) {
		const next = selectedLabels.includes(label) ? selectedLabels.filter((item) => item !== label) : [...selectedLabels, label];
		await save({ labels: next });
	}

	async function toggleComponent(id: string) {
		const next = selectedComponents.includes(id) ? selectedComponents.filter((item) => item !== id) : [...selectedComponents, id];
		await save({ components: next });
	}

	async function createAndApplyLabel() {
		const name = labelFilter.trim();
		if (!name || !canMaintain) return;
		if (!exactLabel) {
			const item = await createLabel(tenant, project, { name, color: 'd9a66c', description: null });
			labels = [...labels, item];
		}
		if (!selectedLabels.includes(name)) await save({ labels: [...selectedLabels, name] });
		labelFilter = '';
	}

	function addUser(user: string) {
		return assignees.includes(user) ? assignees : [...assignees, user];
	}

	function removeUser(user: string) {
		return assignees.filter((item) => item !== user);
	}

	function changeUserFilter(event: Event) {
		userFilter = (event.currentTarget as HTMLInputElement).value;
		if (userSearchTimer) clearTimeout(userSearchTimer);
		userSearchTimer = setTimeout(() => {
			userSearchTimer = null;
			void refreshUsers(userFilter);
		}, 180);
	}

	function terminalWorkspace(item: WorkspaceStatus) {
		return ['merged', 'closed', 'not_planned'].includes(item.status);
	}

	async function linkWorkspace(item: WorkspaceStatus) {
		if (terminalWorkspace(item) && terminalWorkspaceArmed !== item.name && workspace !== item.name) {
			terminalWorkspaceArmed = item.name;
			return;
		}
		await save({ workspace: item.name, close_issue: terminalWorkspace(item) });
	}
</script>

<aside bind:this={root} class="grid h-fit gap-5 text-sm">
	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="font-medium text-[#eae9e4]">Assignees</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c] disabled:opacity-40" aria-label="Edit assignees" disabled={!canWrite || busy} onclick={() => togglePanel('assignees')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		<div class="grid gap-1.5">
			{#each assignees as user (user)}
				{@const profile = personProfile(user)}
				<div class="flex min-w-0 items-center gap-2 text-[#d8d5ca]">
					<UserAvatar {user} {profile} size="xs" />
					<UserProfileLink {user} {profile} className="truncate text-[#d8d5ca]" />
				</div>
			{:else}
				<p class="text-xs text-[#6f6b5f]">No one assigned</p>
			{/each}
		</div>
		{#if openPanel === 'assignees'}{@render UserPanel('Assign up to 10 people', 'Type or choose a user')}{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="font-medium text-[#eae9e4]">Labels</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c] disabled:opacity-40" aria-label="Edit labels" disabled={!canWrite || busy} onclick={() => togglePanel('labels')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each selectedLabels as name (name)}
				{@const item = labels.find((label) => label.name === name)}
				<span class="px-2 py-0.5 text-xs text-[#eae9e4]" style:background-color={item ? color(item.color) : '#2a2a28'}>{name}</span>
			{:else}
				<span class="text-xs text-[#6f6b5f]">No labels</span>
			{/each}
		</div>
		{#if openPanel === 'labels'}
			<div class="absolute right-0 top-7 z-30 w-[320px] border border-[#2a2a28] bg-[#141412] shadow-lg">
				<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Apply labels</div>
				<div class="border-b border-[#2a2a28] p-2">
					<div class="flex items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 focus-within:border-[#d9a66c]">
						<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
						<input class="metadata-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" placeholder="Filter labels" bind:value={labelFilter} />
					</div>
				</div>
				<div class="max-h-72 overflow-auto">
					{#each filteredLabels as label (label.name)}
						<button class="flex w-full items-start gap-2 border-b border-[#242420] px-3 py-2 text-left hover:bg-[#181816]" onclick={() => toggleLabel(label.name)}>
							<span class="mt-1 h-3 w-3 shrink-0 rounded-full" style:background-color={color(label.color)}></span>
							<span class="min-w-0 flex-1"><span class="block truncate text-sm text-[#eae9e4]">{label.name}</span><span class="block truncate text-xs text-[#8c887e]">{label.description ?? ''}</span></span>
							<span class="text-xs text-[#d9a66c]">{selectedLabels.includes(label.name) ? 'selected' : ''}</span>
						</button>
					{/each}
					{#if labelFilter.trim() && !exactLabel && canMaintain}
						<button class="w-full px-3 py-2 text-left text-xs text-[#d9a66c] hover:bg-[#181816]" onclick={createAndApplyLabel}>Create new label "{labelFilter.trim()}"</button>
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="font-medium text-[#eae9e4]">Components</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c] disabled:opacity-40" aria-label="Edit components" disabled={!canWrite || busy} onclick={() => togglePanel('components')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each selectedComponents as id (id)}
				{@const item = projectComponents.find((component) => component.id === id)}
				<span class="bg-[#1e1e1c] px-2 py-0.5 text-xs text-[#d8d5ca]">{item?.name ?? id}</span>
			{:else}
				<span class="text-xs text-[#6f6b5f]">No components</span>
			{/each}
		</div>
		{#if openPanel === 'components'}
			<div class="absolute right-0 top-7 z-30 w-[320px] border border-[#2a2a28] bg-[#141412] shadow-lg">
				<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Set components</div>
				<div class="max-h-72 overflow-auto">
					{#each visibleComponents as component (component.id)}
						<button class="flex w-full items-start gap-2 border-b border-[#242420] px-3 py-2 text-left hover:bg-[#181816]" onclick={() => toggleComponent(component.id)}>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-[#eae9e4]">{component.name}</span>
								<span class="block truncate text-xs text-[#8c887e]">{component.paths.join(', ')}</span>
							</span>
							<span class="text-xs text-[#d9a66c]">{selectedComponents.includes(component.id) ? 'selected' : ''}</span>
						</button>
					{:else}
						<div class="px-3 py-3 text-xs text-[#6f6b5f]">No components configured</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="font-medium text-[#eae9e4]">Milestone</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c] disabled:opacity-40" aria-label="Set milestone" disabled={!canWrite || busy} onclick={() => togglePanel('milestone')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		<p class="text-xs text-[#6f6b5f]">{milestone ?? 'No milestone'}</p>
		{#if openPanel === 'milestone'}
			<div class="absolute right-0 top-7 z-30 w-[320px] border border-[#2a2a28] bg-[#141412] shadow-lg">
				<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Set milestone</div>
				<div class="border-b border-[#2a2a28] p-2">
					<div class="flex items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 focus-within:border-[#d9a66c]">
						<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
						<input class="metadata-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" placeholder="Filter milestones" bind:value={milestoneFilter} />
					</div>
				</div>
				{#if milestone}
					<button class="block w-full border-b border-[#242420] px-3 py-2 text-left text-xs text-[#d9a66c] hover:bg-[#181816]" onclick={() => save({ milestone: null })}>Clear milestone</button>
				{/if}
				{#each filteredMilestones as item (item.id)}
					<button class="block w-full border-b border-[#242420] px-3 py-2 text-left hover:bg-[#181816]" onclick={() => save({ milestone: item.title })}>
						<span class="block text-sm text-[#eae9e4]">{item.title}</span>
						<span class="block truncate text-xs text-[#8c887e]">{item.description ?? ''}</span>
					</button>
				{:else}
					<div class="px-3 py-3 text-xs text-[#6f6b5f]">Nothing to show</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="font-medium text-[#eae9e4]">Type</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c] disabled:opacity-40" aria-label="Set issue type" disabled={!canWrite || busy} onclick={() => togglePanel('type')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		{#if selectedIssueType}
			<div class="flex items-start gap-2">
				<span class="mt-1 h-3 w-3 shrink-0 rounded-full border-2 bg-transparent" style:border-color={selectedIssueType.color}></span>
				<div class="min-w-0">
					<div class="text-sm text-[#d8d5ca]">{selectedIssueType.label}</div>
					<div class="truncate text-xs text-[#6f6b5f]">{selectedIssueType.description}</div>
				</div>
			</div>
		{:else}
			<p class="text-xs text-[#6f6b5f]">No type</p>
		{/if}
		{#if openPanel === 'type'}
			<div class="absolute right-0 top-7 z-30 w-[320px] border border-[#2a2a28] bg-[#141412] shadow-lg">
				<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Select issue type</div>
				<div class="border-b border-[#2a2a28] p-2">
					<div class="flex items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 focus-within:border-[#d9a66c]">
						<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
						<input class="metadata-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" placeholder="Filter types" bind:value={typeFilter} />
					</div>
				</div>
				<div class="max-h-72 overflow-auto">
					{#if issueType}
						<button class="block w-full border-b border-[#242420] px-3 py-2 text-left text-xs text-[#d9a66c] hover:bg-[#181816]" onclick={() => save({ issue_type: null })}>Clear type</button>
					{/if}
					{#each filteredIssueTypes as type (type.value)}
						<button class="flex w-full items-start gap-2 border-b border-[#242420] px-3 py-2 text-left hover:bg-[#181816]" onclick={() => save({ issue_type: type.value })}>
							<span class="mt-1 h-3 w-3 shrink-0 rounded-full border-2 bg-transparent" style:border-color={type.color}></span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-[#eae9e4]">{type.label}</span>
								<span class="block truncate text-xs text-[#8c887e]">{type.description}</span>
							</span>
							<span class="text-xs text-[#d9a66c]">{issueType === type.value ? 'selected' : ''}</span>
						</button>
					{:else}
						<div class="px-3 py-3 text-xs text-[#6f6b5f]">Nothing to show</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	{#if mode === 'issue'}
		<section class="relative border-b border-[#2a2a28] pb-4">
			<div class="mb-3 flex items-center justify-between gap-3">
				<div class="font-medium text-[#eae9e4]">Development</div>
				<button class="text-[#8c887e] hover:text-[#d9a66c] disabled:opacity-40" aria-label="Link workspace" disabled={!canWrite || busy} onclick={() => togglePanel('development')}><CirclePlus class="h-4 w-4" /></button>
			</div>
			{#if selectedWorkspace}
				<div class="flex min-w-0 items-center gap-2 text-sm text-[#d8d5ca]">
					<Link2 class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
					<span class="truncate">{selectedWorkspace.name}</span>
				</div>
			{:else if workspace}
				<div class="flex min-w-0 items-center gap-2 text-sm text-[#d8d5ca]">
					<Link2 class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
					<span class="truncate">{workspace}</span>
				</div>
			{:else}
				<p class="text-xs text-[#6f6b5f]">No linked workspace</p>
			{/if}
			{#if openPanel === 'development'}
				<div class="absolute right-0 top-7 z-30 w-[340px] border border-[#2a2a28] bg-[#141412] shadow-lg">
					<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Link a workspace</div>
					<div class="border-b border-[#2a2a28] p-2">
						<div class="flex items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 focus-within:border-[#d9a66c]">
							<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
							<input class="metadata-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" placeholder="Search workspaces" bind:value={workspaceFilter} />
						</div>
					</div>
					{#if workspace}
						<button class="block w-full border-b border-[#242420] px-3 py-2 text-left text-xs text-[#d9a66c] hover:bg-[#181816]" onclick={() => save({ workspace: null })}>Unlink workspace</button>
					{/if}
					<div class="max-h-72 overflow-auto">
						{#each visibleWorkspaces as item (item.name)}
							<button class="flex w-full items-center gap-2 border-b border-[#242420] px-3 py-2 text-left hover:bg-[#181816]" onclick={() => linkWorkspace(item)}>
								<Link2 class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm text-[#eae9e4]">{item.name}</span>
									<span class="block truncate text-xs {terminalWorkspace(item) && terminalWorkspaceArmed === item.name ? 'text-[#d9a66c]' : 'text-[#8c887e]'}">{terminalWorkspace(item) && terminalWorkspaceArmed === item.name ? 'Click again to link and close this issue' : item.status}</span>
								</span>
								<span class="text-xs text-[#d9a66c]">{workspace === item.name ? 'linked' : ''}</span>
							</button>
						{:else}
							<div class="px-3 py-3 text-xs text-[#6f6b5f]">No workspaces</div>
						{/each}
						{#if filteredWorkspaces.length > visibleWorkspaces.length}
							<div class="px-3 py-2 text-xs text-[#6f6b5f]">Keep typing to narrow {filteredWorkspaces.length - visibleWorkspaces.length} more.</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<section class="border-b border-[#2a2a28] pb-4">
			<div class="mb-2 font-medium text-[#8c887e]">Notifications</div>
			<button class="flex w-full items-center justify-center gap-2 bg-[#242420] px-3 py-1.5 text-xs text-[#eae9e4] hover:bg-[#2a2a28]" onclick={() => (subscribed = !subscribed)}><BellOff class="h-3.5 w-3.5" />{subscribed ? 'Unsubscribe' : 'Subscribe'}</button>
			<p class="mt-2 text-xs leading-5 text-[#8c887e]">You are {subscribed ? 'receiving' : 'not receiving'} notifications for this issue.</p>
		</section>

		<section class="border-b border-[#2a2a28] pb-4">
			<div class="mb-3 font-medium text-[#eae9e4]">{participants.length} {participants.length === 1 ? 'participant' : 'participants'}</div>
			<div class="flex flex-wrap gap-1.5">
				{#each participants as participant (participant.user)}
					<UserAvatar user={participant.user} profile={participant.profile} />
				{/each}
			</div>
		</section>

		{#if canMaintain}
			<section class="relative grid gap-2 text-sm">
				<button class="flex items-center gap-2 text-left text-[#d8d5ca] hover:text-[#d9a66c]" disabled={busy} onclick={() => togglePanel('transfer')}>
					<ArrowRight class="h-4 w-4" /> Transfer issue
				</button>
				<button class="flex items-center gap-2 text-left text-[#d8d5ca] hover:text-[#d9a66c]" disabled={busy} onclick={() => save({ locked: !locked })}>
					{#if locked}<Unlock class="h-4 w-4" /> Unlock conversation{:else}<Lock class="h-4 w-4" /> Lock conversation{/if}
				</button>
				<button class="flex items-center gap-2 text-left text-[#d8d5ca] hover:text-[#d9a66c]" disabled={busy} onclick={() => save({ pinned: !pinned })}>
					<Pin class="h-4 w-4" /> {pinned ? 'Unpin issue' : 'Pin issue'}
				</button>
				<button class="flex items-center gap-2 text-left text-[#d96c5a] hover:text-[#f08a77]" disabled={busy || !onDelete} onclick={deleteIssue}>
					<Trash2 class="h-4 w-4" /> {deleteArmed ? 'Confirm delete issue' : 'Delete issue'}
				</button>
				{#if openPanel === 'transfer'}
					<div class="absolute bottom-full right-0 z-30 mb-3 w-[360px] border border-[#2a2a28] bg-[#141412] shadow-lg">
						<div class="flex items-start justify-between gap-4 border-b border-[#2a2a28] px-3 py-3">
							<div>
								<div class="text-sm font-medium text-[#eae9e4]">Transfer issue</div>
								<p class="mt-1 text-xs leading-5 text-[#8c887e]">Move this issue to another project you can write to.</p>
							</div>
							<button class="text-[#8c887e] hover:text-[#eae9e4]" aria-label="Close transfer panel" onclick={() => (openPanel = '')}>×</button>
						</div>
						<div class="border-b border-[#2a2a28] p-2">
							<div class="flex items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 focus-within:border-[#d9a66c]">
								<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
								<input class="metadata-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" placeholder="Select tenant/project" bind:value={projectFilter} />
							</div>
						</div>
						<div class="max-h-80 overflow-auto">
							{#each filteredProjects as item (`${item.tenant}/${item.project}`)}
								<button class="flex w-full items-center gap-2 border-b border-[#242420] px-3 py-2 text-left hover:bg-[#181816]" onclick={() => transfer(item)}>
									<ArrowRight class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
									<span class="min-w-0 flex-1 truncate text-sm text-[#eae9e4]">{item.tenant}/{item.project}</span>
								</button>
							{:else}
								<div class="px-3 py-3 text-xs text-[#6f6b5f]">No projects</div>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</aside>

{#snippet UserPanel(title: string, placeholder: string)}
	<div class="absolute right-0 top-7 z-30 w-[320px] border border-[#2a2a28] bg-[#141412] shadow-lg">
		<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">{title}</div>
		<div class="border-b border-[#2a2a28] p-2">
			<div class="flex items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 focus-within:border-[#d9a66c]">
				<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
				<input class="metadata-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" {placeholder} value={userFilter} oninput={changeUserFilter} />
			</div>
		</div>
		<div class="max-h-64 overflow-auto">
			{#each filteredUsers as user (user.user)}
				<button class="flex w-full items-center gap-2 border-b border-[#242420] px-3 py-2 text-left hover:bg-[#181816]" onclick={() => save({ assignees: assignees.includes(user.user) ? removeUser(user.user) : addUser(user.user) })}>
					<UserAvatar user={user.user} profile={user} size="sm" linked={false} />
					<span class="min-w-0 flex-1 truncate text-sm text-[#eae9e4]">{personLabel(user)}</span>
					<span class="text-xs text-[#d9a66c]">{assignees.includes(user.user) ? 'selected' : ''}</span>
				</button>
			{:else}
				<div class="px-3 py-3 text-xs text-[#6f6b5f]">No suggestions</div>
			{/each}
		</div>
	</div>
{/snippet}

<style>
	.metadata-input:focus,
	.metadata-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
