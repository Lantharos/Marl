<script lang="ts">
	import { onMount } from 'svelte';
	import type { HistoryEntry, WorkspaceStatus } from '$lib/api';
	import type { Label, Milestone, UserProfile } from '$lib/api';
	import { createLabel, listIssuesPage, listLabels, listMilestones, searchUsers } from '$lib/api';
	import type { Issue } from '$lib/issueApi';
	import { userDisplayName, userInitials } from '$lib/identity';
	import BellOff from 'lucide-svelte/icons/bell-off';
	import CirclePlus from 'lucide-svelte/icons/circle-plus';
	import Link2 from 'lucide-svelte/icons/link-2';
	import Lock from 'lucide-svelte/icons/lock';
	import Settings from 'lucide-svelte/icons/settings';

	type WorkspaceDetail = WorkspaceStatus & { history?: HistoryEntry[] };
	type Reviewer = { author: string; profile?: UserProfile | null; state: string; stateClass: string };
	type MetadataPatch = Partial<Pick<WorkspaceStatus, 'reviewers' | 'assignees' | 'milestone' | 'linked_issues' | 'locked'>>;

	let {
		tenant,
		project,
		detail,
		reviewers,
		participants,
		authorEntry,
		canWrite,
		canMaintain,
		busy,
		onSaveLabels,
		onSaveMetadata
	}: {
		tenant: string;
		project: string;
		detail: WorkspaceDetail;
		reviewers: Reviewer[];
		participants: { user: string; profile?: UserProfile | null }[];
		authorEntry: HistoryEntry | null;
		canWrite: boolean;
		canMaintain: boolean;
		busy: boolean;
		onSaveLabels: (labels: string[]) => Promise<void> | void;
		onSaveMetadata: (metadata: MetadataPatch) => Promise<void> | void;
	} = $props();

	let openPanel = $state('');
	let labelFilter = $state('');
	let userFilter = $state('');
	let milestoneFilter = $state('');
	let issueFilter = $state('');
	let labels = $state<Label[]>([]);
	let milestones = $state<Milestone[]>([]);
	let users = $state<UserProfile[]>([]);
	let issues = $state<Issue[]>([]);
	let subscribed = $state(true);
	let loadedSubscriptionKey = $state('');
	let root = $state<HTMLElement | null>(null);
	let userSearchController: AbortController | null = null;

	const selectedLabels = $derived(detail.labels ?? []);
	const selectedReviewers = $derived(detail.reviewers ?? []);
	const selectedAssignees = $derived(detail.assignees ?? []);
	const linkedIssues = $derived(detail.linked_issues ?? []);
	const reviewerRows = $derived(mergePeople(selectedReviewers, reviewers));
	const assigneeRows = $derived(selectedAssignees.map((user) => ({ user, profile: users.find((item) => item.user === user) ?? null })));
	const filteredLabels = $derived(labels.filter((label) => label.name.toLowerCase().includes(labelFilter.trim().toLowerCase())));
	const filteredMilestones = $derived(milestones.filter((milestone) => milestone.title.toLowerCase().includes(milestoneFilter.trim().toLowerCase())));
	const filteredUsers = $derived(users.filter((user) => personLabel(user).toLowerCase().includes(userFilter.trim().toLowerCase())));
	const filteredIssues = $derived(issues.filter((issue) => `${issue.number} ${issue.title}`.toLowerCase().includes(issueFilter.trim().toLowerCase())));
	const visibleLinkedIssues = $derived(linkedIssues.slice(0, 10));
	const visibleIssues = $derived(filteredIssues.slice(0, 10));
	const exactLabel = $derived(labels.find((label) => label.name.toLowerCase() === labelFilter.trim().toLowerCase()));
	const subscriptionKey = $derived(`sty:workspace-subscription:${tenant}/${project}/${detail.name}`);

	onMount(() => {
		const controller = new AbortController();
		Promise.all([
			listLabels(tenant, project, { signal: controller.signal }).then((items) => (labels = items)).catch(ignoreAbort),
			listMilestones(tenant, project, { signal: controller.signal }).then((items) => (milestones = items)).catch(ignoreAbort),
			refreshUsers('', controller.signal),
			listIssuesPage(tenant, project, { signal: controller.signal, perPage: 100, state: 'all' }).then((page) => (issues = page.items)).catch(ignoreAbort)
		]);
		function closePanel(event: PointerEvent) {
			if (!openPanel || !root) return;
			if (!root.contains(event.target as Node)) openPanel = '';
		}
		document.addEventListener('pointerdown', closePanel, true);
		return () => {
			userSearchController?.abort();
			controller.abort();
			document.removeEventListener('pointerdown', closePanel, true);
		};
	});

	$effect(() => {
		if (!subscriptionKey || loadedSubscriptionKey === subscriptionKey) return;
		loadedSubscriptionKey = subscriptionKey;
		try {
			const stored = localStorage.getItem(subscriptionKey);
			subscribed = stored === null ? true : stored === 'true';
		} catch {
			subscribed = true;
		}
	});

	$effect(() => {
		if (!subscriptionKey || loadedSubscriptionKey !== subscriptionKey) return;
		try {
			localStorage.setItem(subscriptionKey, String(subscribed));
		} catch {
		}
	});

	function ignoreAbort(error: unknown) {
		if (!(error instanceof Error) || !error.name.includes('Abort')) {
			console.warn(error);
		}
	}

	function togglePanel(panel: string) {
		openPanel = openPanel === panel ? '' : panel;
		if (openPanel === 'reviewers' || openPanel === 'assignees') refreshUsers(userFilter);
	}

	function mergePeople(requested: string[], reviewed: Reviewer[]) {
		const rows = new Map<string, Reviewer>();
		for (const reviewer of reviewed) rows.set(reviewer.author, reviewer);
		for (const user of requested) {
			if (!rows.has(user)) rows.set(user, { author: user, profile: users.find((item) => item.user === user) ?? null, state: 'review requested', stateClass: 'text-[#d9a66c]' });
		}
		return [...rows.values()];
	}

	function personLabel(profile: UserProfile) {
		return `${profile.handle ?? profile.user} ${profile.display_name ?? ''}`.trim();
	}

	function addUser(list: string[], user: string) {
		return list.includes(user) ? list : [...list, user];
	}

	function removeUser(list: string[], user: string) {
		return list.filter((item) => item !== user);
	}

	async function toggleLabel(label: string) {
		await onSaveLabels(selectedLabels.includes(label) ? selectedLabels.filter((item) => item !== label) : [...selectedLabels, label]);
	}

	async function createAndApplyLabel() {
		const name = labelFilter.trim();
		if (!name) return;
		if (!exactLabel) {
			const item = await createLabel(tenant, project, { name, color: 'd9a66c', description: null });
			labels = [...labels, item];
		}
		await onSaveLabels(selectedLabels.includes(name) ? selectedLabels : [...selectedLabels, name]);
		labelFilter = '';
	}

	function issueLabel(id: string) {
		const issue = issues.find((item) => item.id === id || String(item.number) === id);
		return issue ? `#${issue.number} ${issue.title}` : id;
	}

	function panelButton(panel: string) {
		return canWrite ? togglePanel(panel) : undefined;
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
		} catch (error) {
			ignoreAbort(error);
		}
	}

	function changeUserFilter(event: Event) {
		userFilter = (event.currentTarget as HTMLInputElement).value;
		refreshUsers(userFilter);
	}
</script>

<aside bind:this={root} class="grid h-fit gap-5">
	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="text-sm font-medium text-[#eae9e4]">Reviewers</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c]" aria-label="Request reviewers" onclick={() => panelButton('reviewers')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		<div class="grid gap-2">
			{#each reviewerRows as reviewer}
				<div class="flex items-center gap-2 text-sm text-[#d8d5ca]">
					<div class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[9px]">
						{#if reviewer.profile?.avatar_url}<img src={reviewer.profile.avatar_url} alt="" class="h-full w-full object-cover" />{:else}{userInitials(reviewer.author, reviewer.profile)}{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="truncate">{userDisplayName(reviewer.author, reviewer.profile)}</div>
						<div class="text-[11px] {reviewer.stateClass}">{reviewer.state}</div>
					</div>
				</div>
			{:else}
				<p class="text-xs text-[#6f6b5f]">No reviewers yet.</p>
			{/each}
		</div>
		{#if openPanel === 'reviewers'}{@render UserPanel('Request reviewers', 'Type or choose a user', selectedReviewers, (user) => onSaveMetadata({ reviewers: addUser(selectedReviewers, user) }), (user) => onSaveMetadata({ reviewers: removeUser(selectedReviewers, user) }))}{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="text-sm font-medium text-[#eae9e4]">Assignees</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c]" aria-label="Assign people" onclick={() => panelButton('assignees')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		{#each assigneeRows as assignee}
			<div class="text-sm text-[#d8d5ca]">{userDisplayName(assignee.user, assignee.profile)}</div>
		{:else}
			<p class="text-xs text-[#6f6b5f]">None</p>
		{/each}
		{#if openPanel === 'assignees'}{@render UserPanel('Assign people', 'Type or choose a user', selectedAssignees, (user) => onSaveMetadata({ assignees: addUser(selectedAssignees, user) }), (user) => onSaveMetadata({ assignees: removeUser(selectedAssignees, user) }))}{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="text-sm font-medium text-[#eae9e4]">Labels</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c]" aria-label="Edit labels" onclick={() => panelButton('labels')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each selectedLabels as label}
				<span class="bg-[#1e1e1c] px-2 py-1 text-xs text-[#a09d94]">{label}</span>
			{:else}
				<span class="text-xs text-[#6f6b5f]">None</span>
			{/each}
		</div>
		{#if openPanel === 'labels'}
			<div class="absolute right-0 top-7 z-30 w-[300px] border border-[#2a2a28] bg-[#141412] shadow-lg">
				<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Apply labels</div>
				<div class="border-b border-[#2a2a28] p-2">
					<input class="panel-input w-full border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Filter labels" bind:value={labelFilter} />
				</div>
				<div class="max-h-64 overflow-auto">
					{#each filteredLabels as label}
						<button class="flex w-full items-start gap-2 border-b border-[#242420] px-3 py-2 text-left text-xs hover:bg-[#181816]" onclick={() => toggleLabel(label.name)}>
							<span class="mt-1 h-3 w-3 shrink-0 rounded-full" style={`background:#${label.color}`}></span>
							<span class="min-w-0"><span class="block text-[#eae9e4]">{label.name}</span><span class="block text-[#8c887e]">{label.description ?? ''}</span></span>
							<span class="ml-auto text-[#d9a66c]">{selectedLabels.includes(label.name) ? 'selected' : ''}</span>
						</button>
					{/each}
					{#if labelFilter.trim() && !exactLabel}
						<button class="w-full px-3 py-2 text-left text-xs text-[#d9a66c] hover:bg-[#181816]" onclick={createAndApplyLabel}>Create new label "{labelFilter.trim()}"</button>
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div class="text-sm font-medium text-[#eae9e4]">Milestone</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c]" aria-label="Set milestone" onclick={() => panelButton('milestone')}><CirclePlus class="h-4 w-4" /></button>
		</div>
		<p class="text-xs text-[#6f6b5f]">{detail.milestone ?? 'No milestone'}</p>
		{#if openPanel === 'milestone'}
			<div class="absolute right-0 top-7 z-30 w-[300px] border border-[#2a2a28] bg-[#141412] shadow-lg">
				<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Set milestone</div>
				<div class="border-b border-[#2a2a28] p-2"><input class="panel-input w-full border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Filter milestones" bind:value={milestoneFilter} /></div>
				{#each filteredMilestones as milestone}
					<button class="block w-full border-b border-[#242420] px-3 py-2 text-left text-xs hover:bg-[#181816]" onclick={() => onSaveMetadata({ milestone: milestone.title })}>
						<span class="block text-[#eae9e4]">{milestone.title}</span>
						<span class="block text-[#8c887e]">{milestone.description ?? ''}</span>
					</button>
				{:else}
					<div class="px-3 py-3 text-xs text-[#6f6b5f]">Nothing to show</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="relative border-b border-[#2a2a28] pb-4">
		<div class="mb-2 flex items-center justify-between gap-3">
			<div class="text-sm font-medium text-[#eae9e4]">Development</div>
			<button class="text-[#8c887e] hover:text-[#d9a66c]" aria-label="Link issues" onclick={() => panelButton('development')}><Settings class="h-4 w-4" /></button>
		</div>
		{#each visibleLinkedIssues as issue}
			<div class="text-xs text-[#d9a66c]">{issueLabel(issue)}</div>
		{:else}
			<p class="text-xs text-[#6f6b5f]">None yet</p>
		{/each}
		{#if linkedIssues.length > visibleLinkedIssues.length}
			<p class="mt-1 text-xs text-[#6f6b5f]">{linkedIssues.length - visibleLinkedIssues.length} more linked</p>
		{/if}
		{#if openPanel === 'development'}
			<div class="absolute right-0 top-7 z-30 w-[300px] border border-[#2a2a28] bg-[#141412] shadow-lg">
				<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Link an issue from this repository</div>
				<div class="border-b border-[#2a2a28] p-2"><input class="panel-input w-full border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Filter" bind:value={issueFilter} /></div>
				{#each visibleIssues as issue}
					<button class="flex w-full items-center gap-2 border-b border-[#242420] px-3 py-2 text-left text-xs hover:bg-[#181816]" onclick={() => onSaveMetadata({ linked_issues: linkedIssues.includes(issue.id) ? linkedIssues.filter((item) => item !== issue.id) : [...linkedIssues, issue.id] })}>
						<Link2 class="h-3.5 w-3.5 text-[#8c887e]" />
						<span class="min-w-0 truncate text-[#eae9e4]">#{issue.number} {issue.title}</span>
					</button>
				{:else}
					<div class="px-3 py-3 text-xs text-[#6f6b5f]">No results</div>
				{/each}
				{#if filteredIssues.length > visibleIssues.length}
					<div class="px-3 py-2 text-xs text-[#6f6b5f]">Keep typing to narrow {filteredIssues.length - visibleIssues.length} more.</div>
				{/if}
			</div>
		{/if}
	</section>

	<section class="border-b border-[#2a2a28] pb-4">
		<div class="mb-2 text-sm text-[#8c887e]">Notifications</div>
		<button class="flex w-full items-center justify-center gap-2 bg-[#242420] px-3 py-1.5 text-xs text-[#eae9e4]" onclick={() => (subscribed = !subscribed)}><BellOff class="h-3.5 w-3.5" />{subscribed ? 'Unsubscribe' : 'Subscribe'}</button>
		<p class="mt-2 text-xs leading-5 text-[#8c887e]">You are {subscribed ? 'receiving' : 'not receiving'} notifications for this workspace.</p>
	</section>

	<section class="border-b border-[#2a2a28] pb-4">
		<div class="mb-3 text-sm font-medium text-[#eae9e4]">{participants.length} {participants.length === 1 ? 'participant' : 'participants'}</div>
		<div class="flex flex-wrap gap-1.5">
			{#each participants as participant}
				<div class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[9px] text-[#eae9e4]">
					{#if participant.profile?.avatar_url}<img src={participant.profile.avatar_url} alt="" class="h-full w-full object-cover" />{:else}{userInitials(participant.user, participant.profile)}{/if}
				</div>
			{/each}
		</div>
	</section>

	{#if canMaintain}
		<button class="flex items-center gap-2 text-left text-sm font-medium text-[#eae9e4] hover:text-[#d9a66c]" disabled={busy} onclick={() => onSaveMetadata({ locked: !detail.locked })}>
			<Lock class="h-4 w-4" /> {detail.locked ? 'Unlock conversation' : 'Lock conversation'}
		</button>
	{/if}
</aside>

{#snippet UserPanel(title: string, placeholder: string, selected: string[], add: (user: string) => void, remove: (user: string) => void)}
	<div class="absolute right-0 top-7 z-30 w-[300px] border border-[#2a2a28] bg-[#141412] shadow-lg">
		<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">{title}</div>
		<div class="border-b border-[#2a2a28] p-2"><input class="panel-input w-full border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1.5 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" {placeholder} value={userFilter} oninput={changeUserFilter} /></div>
		<div class="max-h-56 overflow-auto">
			{#each filteredUsers as user}
				<button class="flex w-full items-center gap-2 border-b border-[#242420] px-3 py-2 text-left text-xs hover:bg-[#181816]" onclick={() => selected.includes(user.user) ? remove(user.user) : add(user.user)}>
					<div class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[9px] text-[#eae9e4]">{#if user.avatar_url}<img src={user.avatar_url} alt="" class="h-full w-full object-cover" />{:else}{userInitials(user.user, user)}{/if}</div>
					<span class="min-w-0 flex-1 truncate text-[#eae9e4]">{personLabel(user)}</span>
					<span class="text-[#d9a66c]">{selected.includes(user.user) ? 'selected' : ''}</span>
				</button>
			{:else}
				<div class="px-3 py-3 text-xs text-[#6f6b5f]">No suggestions</div>
			{/each}
		</div>
	</div>
{/snippet}

<style>
	.panel-input:focus,
	.panel-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
