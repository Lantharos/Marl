<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		createIssue,
		createLabel,
		createMilestone,
		getMe,
		isAbortError,
		listIssuesPage,
		listLabelsPage,
		listMilestonesPage,
		type Issue,
		type Label,
		type Milestone
	} from '$lib/api';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userName } from '$lib/identity';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Circle from 'lucide-svelte/icons/circle';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	type Tab = 'issues' | 'labels' | 'milestones';
	type IssueState = 'open' | 'closed' | 'all';
	const chunkSize = 25;

	let activeTab = $state<Tab>('issues');
	let filter = $state<IssueState>('open');
	let query = $state('');
	let labelQuery = $state('');
	let milestoneQuery = $state('');
	let selectedLabel = $state('');
	let issueItems = $state<Issue[]>([]);
	let labelItems = $state<Label[]>([]);
	let milestoneItems = $state<Milestone[]>([]);
	let visibleIssues = $state(chunkSize);
	let visibleLabels = $state(chunkSize);
	let visibleMilestones = $state(chunkSize);
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);

	let showIssueForm = $state(false);
	let title = $state('');
	let body = $state('');
	let selectedIssueLabels = $state<string[]>([]);
	let labelDraft = $state('');
	let assignee = $state('');
	let assigneeDraft = $state('');
	let currentUser = $state('');

	let labelName = $state('');
	let labelColor = $state('#d9a66c');
	let labelDescription = $state('');
	let milestoneTitle = $state('');
	let milestoneDescription = $state('');
	let milestoneDue = $state('');
	let canWrite = $state(false);
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	const issues = $derived(issueItems);
	const labels = $derived(labelItems);
	const milestones = $derived(milestoneItems);
	const filteredLabels = $derived(
		labels.filter((label) => {
			const haystack = `${label.name} ${label.description ?? ''} ${label.color}`.toLowerCase();
			return haystack.includes(labelQuery.trim().toLowerCase());
		})
	);
	const filteredMilestones = $derived(
		milestones.filter((milestone) => {
			const haystack = `${milestone.title} ${milestone.description ?? ''} ${milestone.state ?? ''}`.toLowerCase();
			return haystack.includes(milestoneQuery.trim().toLowerCase());
		})
	);
	const filteredIssues = $derived(
		issues.filter((issue) => {
			const haystack = `${issue.title} ${issue.body} ${issue.labels.join(' ')} ${userName(issue.author, issue.author_profile)}`.toLowerCase();
			return haystack.includes(query.trim().toLowerCase());
		})
	);
	const shownIssues = $derived(filteredIssues.slice(0, visibleIssues));
	const shownLabels = $derived(filteredLabels.slice(0, visibleLabels));
	const shownMilestones = $derived(filteredMilestones.slice(0, visibleMilestones));
	const people = $derived(() => {
		const names = new Set<string>();
		if (currentUser) names.add(currentUser);
		for (const issue of issues) {
			const author = userName(issue.author, issue.author_profile);
			if (author !== 'Unknown user') names.add(author);
			for (const person of issue.assignees ?? []) {
				const name = userName(person);
				if (name !== 'Unknown user') names.add(name);
			}
		}
		return [...names].sort((a, b) => a.localeCompare(b));
	});
	const availableLabelSuggestions = $derived(() => {
		const needle = labelDraft.trim().toLowerCase();
		return labels
			.filter((label) => !selectedIssueLabels.includes(label.name))
			.filter((label) => !needle || label.name.toLowerCase().includes(needle))
			.slice(0, 8);
	});
	const assigneeSuggestions = $derived(() => {
		const needle = assigneeDraft.trim().toLowerCase();
		return people()
			.filter((person) => !needle || person.toLowerCase().includes(needle))
			.slice(0, 8);
	});
	const exactDraftLabel = $derived(labels.find((label) => label.name.toLowerCase() === labelDraft.trim().toLowerCase()));
	const exactDraftAssignee = $derived(people().find((person) => person.toLowerCase() === assigneeDraft.trim().toLowerCase()));
	const canCreateIssue = $derived(
		canWrite && !!title.trim() && !busy && (!labelDraft.trim() || !!exactDraftLabel) && (!assigneeDraft.trim() || !!exactDraftAssignee)
	);

	$effect(() => {
		if (!canWrite) showIssueForm = false;
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [issuesResult, labelsResult, milestonesResult, me] = await Promise.all([
				listIssuesPage(tenant, project, {
					page: 1,
					perPage: 500,
					state: filter,
					label: selectedLabel || undefined,
					signal
				}),
				listLabelsPage(tenant, project, { page: 1, perPage: 500, signal }).catch(() => null),
				listMilestonesPage(tenant, project, { page: 1, perPage: 500, signal }).catch(() => null),
				getMe({ signal }).catch(() => null)
			]);
			issueItems = issuesResult.items;
			labelItems = labelsResult?.items ?? [];
			milestoneItems = milestonesResult?.items ?? [];
			currentUser = me?.profile?.handle ?? currentUser;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	$effect(() => { assignee = exactDraftAssignee ?? ''; });

	$effect(() => {
		filter;
		query;
		selectedLabel;
		visibleIssues = chunkSize;
	});

	$effect(() => { labelQuery; visibleLabels = chunkSize; });

	$effect(() => { milestoneQuery; visibleMilestones = chunkSize; });

	async function reloadCurrent() { await load(); }

	async function handleCreateIssue() {
		if (!canCreateIssue) return;
		const labels = [...selectedIssueLabels];
		if (exactDraftLabel && !labels.includes(exactDraftLabel.name)) {
			labels.push(exactDraftLabel.name);
		}
		const chosenAssignee = assignee || exactDraftAssignee || '';
		busy = true;
		try {
			await createIssue(tenant, project, {
				title: title.trim(),
				body: body.trim(),
				labels,
				assignee: chosenAssignee || undefined
			});
			title = '';
			body = '';
			selectedIssueLabels = [];
			labelDraft = '';
			assignee = '';
			assigneeDraft = '';
			showIssueForm = false;
			await reloadCurrent();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleCreateLabel() {
		if (!labelName.trim()) return;
		busy = true;
		try {
			await createLabel(tenant, project, {
				name: labelName.trim(),
				color: labelColor.trim() || '#d9a66c',
				description: labelDescription.trim() || null
			});
			labelName = '';
			labelDescription = '';
			await reloadCurrent();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleCreateMilestone() {
		if (!milestoneTitle.trim()) return;
		busy = true;
		try {
			await createMilestone(tenant, project, {
				title: milestoneTitle.trim(),
				description: milestoneDescription.trim() || null,
				due_at: milestoneDue || null,
				state: 'open'
			});
			milestoneTitle = '';
			milestoneDescription = '';
			milestoneDue = '';
			await reloadCurrent();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	function setFilter(next: IssueState) { filter = next; }
	function setLabelFilter(name: string) { selectedLabel = selectedLabel === name ? '' : name; activeTab = 'issues'; }
	function removeIssueLabel(name: string) { selectedIssueLabels = selectedIssueLabels.filter((label) => label !== name); }
	function chooseAssignee(name: string) { assignee = name; assigneeDraft = name; }

	function addIssueLabel(name: string) {
		if (!name || selectedIssueLabels.includes(name)) return;
		selectedIssueLabels = [...selectedIssueLabels, name];
		labelDraft = '';
	}

	function visibleAssignees(issue: Issue) {
		return (issue.assignees ?? [])
			.map((person) => userName(person))
			.filter((person) => person !== 'Unknown user');
	}

	function loadMoreIssues() { visibleIssues = Math.min(visibleIssues + chunkSize, filteredIssues.length); }
	function loadMoreLabels() { visibleLabels = Math.min(visibleLabels + chunkSize, filteredLabels.length); }
	function loadMoreMilestones() { visibleMilestones = Math.min(visibleMilestones + chunkSize, filteredMilestones.length); }
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 flex flex-wrap items-center gap-3">
		<div class="flex bg-[#141412] p-0.5">
			{#each [
				['issues', 'Issues'],
				['labels', 'Labels'],
				['milestones', 'Milestones']
			] as tab}
				<button
					class="px-3 py-1.5 text-sm {activeTab === tab[0] ? 'bg-[#2a2a28] text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}"
					onclick={() => (activeTab = tab[0] as Tab)}
				>
					{tab[1]}
				</button>
			{/each}
		</div>

		{#if activeTab === 'issues'}
			<div class="flex bg-[#141412] p-0.5">
				{#each ['open', 'closed', 'all'] as item}
					<button class="px-2.5 py-1 text-xs {filter === item ? 'bg-[#2a2a28] text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => setFilter(item as IssueState)}>
						{item}
					</button>
				{/each}
			</div>
			<div class="flex items-center gap-2 bg-[#141412] px-2.5 py-1.5">
				<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
				<input class="w-48 border-0 bg-transparent text-sm text-[#eae9e4] outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search issues" bind:value={query} />
			</div>
		{:else if activeTab === 'labels'}
			<div class="flex items-center gap-2 bg-[#141412] px-2.5 py-1.5">
				<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
				<input class="w-48 border-0 bg-transparent text-sm text-[#eae9e4] outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search labels" bind:value={labelQuery} />
			</div>
		{:else}
			<div class="flex items-center gap-2 bg-[#141412] px-2.5 py-1.5">
				<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
				<input class="w-48 border-0 bg-transparent text-sm text-[#eae9e4] outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search milestones" bind:value={milestoneQuery} />
			</div>
		{/if}

		{#if canWrite}
			<div class="ml-auto">
			{#if activeTab === 'issues'}
				<button class="inline-flex items-center gap-1 bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]" onclick={() => (showIssueForm = !showIssueForm)}>
					<Plus class="h-3.5 w-3.5" /> New issue
				</button>
			{/if}
			</div>
		{/if}
	</div>

	{#if error}
		<div class="mb-4 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	{#if loading}
		<Spinner />
	{:else if activeTab === 'issues'}
		{#if canWrite && showIssueForm}
			<div class="mb-4 grid gap-3 bg-[#141412] p-4">
				<input class="bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Title" bind:value={title} />
				<textarea class="min-h-[110px] resize-y bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Description" bind:value={body}></textarea>
				<div class="grid gap-3 md:grid-cols-2">
					<div class="grid gap-2">
						<div class="flex min-h-9 self-start flex-wrap items-center gap-1.5 bg-[#0f0f0d] px-2 py-1.5">
							{#each selectedIssueLabels as label}
								<button class="h-6 bg-[#1e1e1c] px-1.5 text-[11px] leading-6 text-[#a09d94] hover:text-[#eae9e4]" onclick={() => removeIssueLabel(label)}>
									{label}
								</button>
							{/each}
							<input class="h-6 min-w-28 flex-1 bg-transparent text-sm leading-6 text-[#eae9e4] outline-none" placeholder={selectedIssueLabels.length ? 'Add label' : 'Labels'} bind:value={labelDraft} />
						</div>
						{#if labelDraft.trim() && !exactDraftLabel}
							<p class="text-[11px] text-[#d96c5a]">Choose an existing label.</p>
						{/if}
						{#if availableLabelSuggestions().length}
							<div class="flex flex-wrap gap-1.5">
								{#each availableLabelSuggestions() as label}
									<button class="inline-flex items-center gap-1 bg-[#0f0f0d] px-2 py-1 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => addIssueLabel(label.name)}>
										<span class="h-2 w-2" style={`background: ${label.color}`}></span>
										{label.name}
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<div class="grid gap-2">
						<input
							class="bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none"
							placeholder="Assignee"
							bind:value={assigneeDraft}
						/>
						{#if assigneeDraft.trim() && !exactDraftAssignee}
							<p class="text-[11px] text-[#d96c5a]">Choose an existing person.</p>
						{/if}
						{#if assigneeSuggestions().length}
							<div class="flex flex-wrap gap-1.5">
								{#each assigneeSuggestions() as person}
									<button class="bg-[#0f0f0d] px-2 py-1 text-xs {person === (assignee || exactDraftAssignee) ? 'text-[#d9a66c]' : 'text-[#a09d94] hover:text-[#eae9e4]'}" onclick={() => chooseAssignee(person)}>
										{person}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div class="flex justify-end gap-2">
					<button class="px-3 py-1.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (showIssueForm = false)}>Cancel</button>
					<button class="bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50" disabled={!canCreateIssue} onclick={handleCreateIssue}>Create</button>
				</div>
			</div>
		{/if}

		{#if selectedLabel}
			<div class="mb-3 flex items-center gap-2 text-xs text-[#8c887e]">
				<span>Filtered by {selectedLabel}</span>
				<button class="text-[#eae9e4] hover:text-[#d9a66c]" onclick={() => setLabelFilter(selectedLabel)}>Clear</button>
			</div>
		{/if}

		<div class="divide-y divide-[#252522] bg-[#141412]">
			{#each shownIssues as issue}
				<button class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#191917]" onclick={() => goto(`/${tenant}/${project}/issues/${issue.id}`)}>
					{#if (issue.state ?? issue.status) === 'open'}
						<Circle class="mt-0.5 h-4 w-4 shrink-0 text-[#7cb97c]" />
					{:else}
						<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-[#d96c5a]" />
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-sm font-medium text-[#eae9e4]">{issue.title}</span>
							{#each issue.labels as label}
								<span class="bg-[#1e1e1c] px-1.5 py-0.5 text-[11px] text-[#a09d94]">{label}</span>
							{/each}
						</div>
						<div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#6f6b5f]">
							<span>#{issue.number}</span>
							<span>opened by {userName(issue.author, issue.author_profile)}</span>
							{#if visibleAssignees(issue).length}<span>assigned to {visibleAssignees(issue).join(', ')}</span>{/if}
							{#if issue.milestone}<span>{issue.milestone}</span>{/if}
							{#if issue.workspace}<span>{issue.workspace}</span>{/if}
							<span>{new Date(issue.updated_at ?? issue.created_at).toLocaleDateString()}</span>
						</div>
					</div>
				</button>
			{:else}
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
					<p class="text-sm text-[#8c887e]">No matching issues.</p>
				</div>
			{/each}
		</div>
		<InfiniteLoader active={shownIssues.length < filteredIssues.length} onVisible={loadMoreIssues} />
	{:else if activeTab === 'labels'}
		<div class={canMaintain ? 'grid gap-5 lg:grid-cols-[1fr_320px]' : 'grid gap-5'}>
			<div class="divide-y divide-[#252522] bg-[#141412]">
				{#each shownLabels as label}
					<button class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#191917]" onclick={() => setLabelFilter(label.name)}>
						<span class="h-3 w-3 shrink-0" style={`background: ${label.color}`}></span>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium text-[#eae9e4]">{label.name}</div>
							{#if label.description}<div class="mt-0.5 text-xs text-[#6f6b5f]">{label.description}</div>{/if}
						</div>
						<div class="font-mono text-xs text-[#6f6b5f]">{label.color}</div>
					</button>
				{:else}
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
						<p class="text-sm text-[#8c887e]">{labelQuery.trim() ? 'No matching labels.' : 'No labels yet.'}</p>
					</div>
				{/each}
			</div>
			{#if canMaintain}
			<form class="grid h-fit gap-3 bg-[#141412] p-4" onsubmit={(event) => { event.preventDefault(); handleCreateLabel(); }}>
				<div class="text-sm font-medium text-[#eae9e4]">New label</div>
				<input class="bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Name" bind:value={labelName} />
				<div class="flex gap-2">
					<span class="h-9 w-9 shrink-0" style={`background: ${labelColor}`}></span>
					<input class="min-w-0 flex-1 bg-[#0f0f0d] px-3 py-2 font-mono text-sm text-[#eae9e4] outline-none" placeholder="#d9a66c" bind:value={labelColor} />
				</div>
				<input class="bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Description" bind:value={labelDescription} />
				<button class="bg-[#eae9e4] px-3 py-2 text-xs font-medium text-[#0f0f0d]" disabled={busy || !labelName.trim()}>Create label</button>
			</form>
			{/if}
		</div>
		<InfiniteLoader active={shownLabels.length < filteredLabels.length} onVisible={loadMoreLabels} />
	{:else}
		<div class={canMaintain ? 'grid gap-5 lg:grid-cols-[1fr_320px]' : 'grid gap-5'}>
			<div class="divide-y divide-[#252522] bg-[#141412]">
				{#each shownMilestones as milestone}
					<div class="px-4 py-3">
						<div class="flex flex-wrap items-center gap-2">
							<div class="text-sm font-medium text-[#eae9e4]">{milestone.title}</div>
							<span class="text-xs text-[#8c887e]">{milestone.state ?? 'open'}</span>
						</div>
						{#if milestone.description}<p class="mt-1 text-sm text-[#a09d94]">{milestone.description}</p>{/if}
						<div class="mt-2 flex flex-wrap gap-2 text-xs text-[#6f6b5f]">
							<span>{milestone.open_issues ?? 0} open</span>
							<span>{milestone.closed_issues ?? 0} closed</span>
							<span>{milestone.due_at ? `due ${new Date(milestone.due_at).toLocaleDateString()}` : 'no due date'}</span>
						</div>
					</div>
				{:else}
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
						<p class="text-sm text-[#8c887e]">{milestoneQuery.trim() ? 'No matching milestones.' : 'No milestones yet.'}</p>
					</div>
				{/each}
			</div>
			{#if canMaintain}
			<form class="grid h-fit gap-3 bg-[#141412] p-4" onsubmit={(event) => { event.preventDefault(); handleCreateMilestone(); }}>
				<div class="text-sm font-medium text-[#eae9e4]">New milestone</div>
				<input class="bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Title" bind:value={milestoneTitle} />
				<textarea class="min-h-[90px] resize-y bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Description" bind:value={milestoneDescription}></textarea>
				<input class="bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Due date, YYYY-MM-DD" bind:value={milestoneDue} />
				<button class="bg-[#eae9e4] px-3 py-2 text-xs font-medium text-[#0f0f0d]" disabled={busy || !milestoneTitle.trim()}>Create milestone</button>
			</form>
			{/if}
		</div>
		<InfiniteLoader active={shownMilestones.length < filteredMilestones.length} onVisible={loadMoreMilestones} />
	{/if}
</div>
