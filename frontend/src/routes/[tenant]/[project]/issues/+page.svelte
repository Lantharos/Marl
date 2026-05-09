<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import {
		isAbortError,
		listIssuesPage,
		listLabelsPage,
		type Issue,
		type Label
	} from '$lib/api';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import UserProfileLink from '$lib/components/UserProfileLink.svelte';
	import { userName } from '$lib/identity';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Circle from 'lucide-svelte/icons/circle';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const issueTypes = {
		bug: { label: 'Bug', color: '#d96c5a' },
		feature: { label: 'Feature', color: '#4a90d9' },
		task: { label: 'Task', color: '#d9a66c' }
	} as const;

	type IssueState = 'open' | 'closed' | 'all';
	const chunkSize = 25;

	let stateFilter = $state<IssueState>('open');
	let query = $state('');
	let selectedLabel = $state('');
	let selectedAssignee = $state('');
	let openPanel = $state('');
	let issueItems = $state<Issue[]>([]);
	let labelItems = $state<Label[]>([]);
	let visibleIssues = $state(chunkSize);
	let loading = $state(true);
	let error = $state('');
	let canWrite = $state(false);
	let filterRoot = $state<HTMLDivElement | null>(null);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
	});

	onDestroy(unsubscribe);

	const openIssues = $derived(issueItems.filter((issue) => (issue.state ?? issue.status) === 'open'));
	const closedIssues = $derived(issueItems.filter((issue) => (issue.state ?? issue.status) === 'closed'));
	const pinnedIssues = $derived(
		issueItems
			.filter((issue) => issue.pinned)
			.sort((a, b) => Date.parse(b.updated_at ?? b.created_at) - Date.parse(a.updated_at ?? a.created_at))
			.slice(0, 4)
	);
	const people = $derived.by(() => {
		const names = new Set<string>();
		for (const issue of issueItems) {
			if (userName(issue.author, issue.author_profile) !== 'Unknown user') names.add(userName(issue.author, issue.author_profile));
			for (const assignee of issue.assignees ?? []) names.add(assignee);
		}
		return [...names].sort((a, b) => a.localeCompare(b));
	});
	const filteredIssues = $derived(
		issueItems.filter((issue) => {
			const state = issue.state ?? issue.status;
			if (stateFilter !== 'all' && state !== stateFilter) return false;
			if (selectedLabel && !issue.labels.includes(selectedLabel)) return false;
			if (selectedAssignee && !(issue.assignees ?? []).includes(selectedAssignee)) return false;
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			const haystack = `${issue.title} ${issue.body} ${issue.issue_type ?? ''} ${issue.labels.join(' ')} ${issue.assignees?.join(' ') ?? ''} ${userName(issue.author, issue.author_profile)}`.toLowerCase();
			return haystack.includes(needle);
		})
	);
	const shownIssues = $derived(filteredIssues.slice(0, visibleIssues));

	onMount(() => {
		selectedLabel = $page.url.searchParams.get('label') ?? '';
		const controller = new AbortController();
		load(controller.signal);
		function closeFilters(event: PointerEvent) {
			if (!openPanel || !filterRoot) return;
			if (!filterRoot.contains(event.target as Node)) openPanel = '';
		}
		document.addEventListener('pointerdown', closeFilters, true);
		return () => {
			controller.abort();
			document.removeEventListener('pointerdown', closeFilters, true);
		};
	});

	$effect(() => {
		stateFilter;
		query;
		selectedLabel;
		selectedAssignee;
		visibleIssues = chunkSize;
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [issuesResult, labelsResult] = await Promise.all([
				listIssuesPage(tenant, project, { page: 1, perPage: 500, state: 'all', signal }),
				listLabelsPage(tenant, project, { page: 1, perPage: 500, signal }).catch(() => null)
			]);
			issueItems = issuesResult.items;
			labelItems = labelsResult?.items ?? [];
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load issues';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	function togglePanel(panel: string) {
		openPanel = openPanel === panel ? '' : panel;
	}

	function color(value: string) {
		const normalized = normalizedLabelColor(value);
		return `#${normalized}`;
	}

	function normalizedLabelColor(value: string) {
		return value.trim().replace(/^#/, '') || 'd9a66c';
	}

	function issueHref(issue: Issue) {
		return `/${tenant}/${project}/issues/${issue.number}`;
	}

	function openIssue(issue: Issue) {
		return goto(issueHref(issue));
	}

	function issueRowKeydown(event: KeyboardEvent, issue: Issue) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		void openIssue(issue);
	}

	function stopRowNavigation(event: Event) {
		event.stopPropagation();
	}

	function issueDate(issue: Issue) {
		return new Date(issue.updated_at ?? issue.created_at).toLocaleDateString();
	}

	function clearFilters() {
		query = '';
		selectedLabel = '';
		selectedAssignee = '';
	}

	function issueTypeMeta(type: Issue['issue_type']) {
		return type && type in issueTypes ? issueTypes[type as keyof typeof issueTypes] : null;
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 flex flex-wrap items-center gap-3">
		<div class="issue-search flex h-9 min-w-64 flex-1 items-center gap-2 border border-transparent bg-[#141412] px-2.5 focus-within:border-[#d9a66c]">
			<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
			<input class="issue-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" placeholder="Search issues" bind:value={query} />
		</div>
		<a class="inline-flex h-9 items-center bg-[#242420] px-3 text-sm text-[#eae9e4] hover:bg-[#2a2a28]" href="/{tenant}/{project}/issues/labels">Labels</a>
		<a class="inline-flex h-9 items-center bg-[#242420] px-3 text-sm text-[#eae9e4] hover:bg-[#2a2a28]" href="/{tenant}/{project}/issues/milestones">Milestones</a>
		{#if canWrite}
			<a class="inline-flex h-9 items-center gap-1 bg-[#eae9e4] px-3 text-sm text-[#0f0f0d] hover:bg-[#d8d3c5]" href="/{tenant}/{project}/issues/new"><Plus class="h-4 w-4" /> New issue</a>
		{/if}
	</div>

	{#if error}
		<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	{#if loading}
		<Spinner />
	{:else}
		{#if pinnedIssues.length}
			<div class="mb-4 grid gap-3 md:grid-cols-2">
				{#each pinnedIssues as issue (issue.id)}
					{@const type = issueTypeMeta(issue.issue_type)}
					<a class="border border-[#2a2a28] bg-[#141412] px-4 py-3 hover:border-[#3a3a36]" href={issueHref(issue)}>
						<div class="flex items-center gap-2 text-sm font-medium text-[#eae9e4]">
							{#if (issue.state ?? issue.status) === 'open'}
								<Circle class="h-3.5 w-3.5 shrink-0 text-[#2fbd55]" />
							{:else}
								<CheckCircle2 class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
							{/if}
							<span class="truncate">{issue.title}</span>
						</div>
						<div class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8c887e]">
							<span>#{issue.number}</span>
							{#if type}
								<span class="inline-flex items-center gap-1">
									<span class="h-2.5 w-2.5 rounded-full border-2 bg-transparent" style:border-color={type.color}></span>
									{type.label}
								</span>
							{/if}
							{#if (issue.comment_count ?? 0) > 0}
								<span class="inline-flex items-center gap-1"><MessageSquare class="h-3 w-3" /> {issue.comment_count}</span>
							{/if}
							<span class="min-w-0 truncate">{issueDate(issue)}</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}

		{#if selectedLabel || selectedAssignee || query.trim()}
			<div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#8c887e]">
				<span>{filteredIssues.length} matching {filteredIssues.length === 1 ? 'issue' : 'issues'}</span>
				{#if selectedLabel}<button class="bg-[#1e1e1c] px-2 py-1 text-[#d9a66c]" onclick={() => (selectedLabel = '')}>label: {selectedLabel} ×</button>{/if}
				{#if selectedAssignee}<button class="bg-[#1e1e1c] px-2 py-1 text-[#d9a66c]" onclick={() => (selectedAssignee = '')}>assignee: {selectedAssignee} ×</button>{/if}
				<button class="text-[#eae9e4] hover:text-[#d9a66c]" onclick={clearFilters}>Clear</button>
			</div>
		{/if}

		<div class="border border-[#2a2a28] bg-[#0f0f0d]">
			<div bind:this={filterRoot} class="relative flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2a28] bg-[#141412] px-4 py-3">
				<div class="flex items-center gap-4 text-sm">
					<button class="{stateFilter === 'open' ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (stateFilter = 'open')}>Open <span class="text-[#6f6b5f]">{openIssues.length}</span></button>
					<button class="{stateFilter === 'closed' ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (stateFilter = 'closed')}>Closed <span class="text-[#6f6b5f]">{closedIssues.length}</span></button>
					<button class="{stateFilter === 'all' ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (stateFilter = 'all')}>All</button>
				</div>
				<div class="flex items-center gap-4 text-sm text-[#8c887e]">
					<button class="hover:text-[#eae9e4]" onclick={() => togglePanel('labels')}>Labels</button>
					<button class="hover:text-[#eae9e4]" onclick={() => togglePanel('assignees')}>Assignees</button>
					<span>Newest</span>
				</div>
				{#if openPanel === 'labels'}
					<div class="absolute right-24 top-11 z-20 w-72 border border-[#2a2a28] bg-[#141412] shadow-lg">
						<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Filter by label</div>
						{#each labelItems as label (label.name)}
							<button class="flex w-full items-center gap-2 border-b border-[#242420] px-3 py-2 text-left text-sm hover:bg-[#181816]" onclick={() => { selectedLabel = label.name; openPanel = ''; }}>
								<span class="h-3 w-3 rounded-full" style:background-color={color(label.color)}></span>
								<span class="truncate text-[#eae9e4]">{label.name}</span>
							</button>
						{:else}
							<div class="px-3 py-3 text-xs text-[#6f6b5f]">No labels yet.</div>
						{/each}
					</div>
				{/if}
				{#if openPanel === 'assignees'}
					<div class="absolute right-4 top-11 z-20 w-72 border border-[#2a2a28] bg-[#141412] shadow-lg">
						<div class="border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#eae9e4]">Filter by assignee</div>
						{#each people as person (person)}
							<button class="block w-full border-b border-[#242420] px-3 py-2 text-left text-sm text-[#eae9e4] hover:bg-[#181816]" onclick={() => { selectedAssignee = person; openPanel = ''; }}>{person}</button>
						{:else}
							<div class="px-3 py-3 text-xs text-[#6f6b5f]">No assignees yet.</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="divide-y divide-[#252522]">
				{#each shownIssues as issue (issue.id)}
					{@const type = issueTypeMeta(issue.issue_type)}
					<div
						class="group flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-[#141412]"
						role="link"
						tabindex="0"
						onclick={() => openIssue(issue)}
						onkeydown={(event) => issueRowKeydown(event, issue)}
					>
						{#if (issue.state ?? issue.status) === 'open'}
							<Circle class="mt-1 h-4 w-4 shrink-0 text-[#2fbd55]" />
						{:else}
							<CheckCircle2 class="mt-1 h-4 w-4 shrink-0 text-[#8c887e]" />
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-[#eae9e4] group-hover:text-[#d9a66c]">{issue.title}</span>
								{#if type}
									<span class="inline-flex items-center gap-1 text-xs text-[#8c887e]">
										<span class="h-2.5 w-2.5 rounded-full border-2 bg-transparent" style:border-color={type.color}></span>
										{type.label}
									</span>
								{/if}
								{#each issue.labels as name (name)}
									{@const item = labelItems.find((label) => label.name === name)}
									<span class="px-1.5 py-0.5 text-[11px] text-[#eae9e4]" style:background-color={item ? color(item.color) : '#2a2a28'}>{name}</span>
								{/each}
							</div>
							<div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#6f6b5f]">
								<span>#{issue.number}</span>
								<span>{(issue.state ?? issue.status) === 'open' ? 'opened' : 'closed'} by <UserProfileLink user={issue.author} profile={issue.author_profile} className="text-[#8c887e]" onclick={stopRowNavigation} /></span>
								{#if issue.milestone}<span>{issue.milestone}</span>{/if}
								{#if issue.workspace}<span>{issue.workspace}</span>{/if}
								<span>{issueDate(issue)}</span>
							</div>
						</div>
						{#if (issue.comment_count ?? 0) > 0}
							<div class="flex shrink-0 items-center gap-1 text-xs text-[#8c887e]"><MessageSquare class="h-3.5 w-3.5" /> {issue.comment_count}</div>
						{/if}
					</div>
				{:else}
					<div class="p-8 text-center text-sm text-[#8c887e]">No matching issues.</div>
				{/each}
			</div>
		</div>
		<InfiniteLoader active={shownIssues.length < filteredIssues.length} onVisible={() => (visibleIssues = Math.min(visibleIssues + chunkSize, filteredIssues.length))} />
	{/if}
</div>

<style>
	.issue-input:focus,
	.issue-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
