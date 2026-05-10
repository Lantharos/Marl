<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		isAbortError,
		listLabelsPage,
		listReviewComments,
		listWorkspaceStatuses,
		type Label,
		type WorkspaceStatus
	} from '$lib/api';
	import DateRangePicker from '$lib/components/DateRangePicker.svelte';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import LabelBadge from '$lib/components/LabelBadge.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { dateInRange } from '$lib/dateRange';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import CircleDot from 'lucide-svelte/icons/circle-dot';
	import FileDiff from 'lucide-svelte/icons/file-diff';
	import GitCommit from 'lucide-svelte/icons/git-commit';
	import GitMerge from 'lucide-svelte/icons/git-merge';
	import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import Search from 'lucide-svelte/icons/search';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const chunkSize = 20;

	let workspaces = $state<WorkspaceStatus[]>([]);
	let labelItems = $state<Label[]>([]);
	let commentCounts = $state<Record<string, number>>({});
	let unresolvedCommentCounts = $state<Record<string, number>>({});
	let loading = $state(true);
	let error = $state('');
	let filter = $state<'open' | 'changes' | 'ready' | 'merged' | 'closed' | 'all'>('open');
	let query = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	let visibleCount = $state(chunkSize);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [all, comments, labelsResult] = await Promise.all([
				listWorkspaceStatuses(tenant, project, signal ? { signal } : {}),
				listReviewComments(tenant, project, {}, { perPage: 500, signal }).catch(() => null),
				listLabelsPage(tenant, project, { page: 1, perPage: 500, signal }).catch(() => null)
			]);
			workspaces = all.filter((workspace) => workspace.name !== 'main');
			labelItems = labelsResult?.items ?? [];
			commentCounts = (comments?.items ?? []).reduce<Record<string, number>>((counts, comment) => {
				if (comment.workspace) counts[comment.workspace] = (counts[comment.workspace] ?? 0) + 1;
				return counts;
			}, {});
			unresolvedCommentCounts = (comments?.items ?? []).reduce<Record<string, number>>((counts, comment) => {
				if (comment.workspace && comment.file && comment.state !== 'resolved') counts[comment.workspace] = (counts[comment.workspace] ?? 0) + 1;
				return counts;
			}, {});
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

	const openWorkspaces = $derived(workspaces.filter((workspace) => !['merged', 'closed', 'not_planned'].includes(workspace.status)));
	const changesRequestedWorkspaces = $derived(openWorkspaces.filter((workspace) => workspace.status === 'changes_requested' || unresolvedCommentCounts[workspace.name]));
	const readyWorkspaces = $derived(workspaces.filter((workspace) => workspace.is_ready && workspace.status !== 'merged'));
	const mergedWorkspaces = $derived(workspaces.filter((workspace) => workspace.status === 'merged'));
	const closedWorkspaces = $derived(workspaces.filter((workspace) => workspace.status === 'closed' || workspace.status === 'not_planned'));
	const filteredWorkspaces = $derived(
		(filter === 'changes'
			? changesRequestedWorkspaces
			: filter === 'ready'
			? readyWorkspaces
			: filter === 'merged'
			? mergedWorkspaces
			: filter === 'closed'
			? closedWorkspaces
			: filter === 'all'
			? workspaces
			: openWorkspaces)
			.filter((workspace) => matchesQuery(workspace))
			.filter((workspace) => dateInRange(workspace.last_activity_at, dateFrom, dateTo))
	);
	const visibleWorkspaces = $derived(filteredWorkspaces.slice(0, visibleCount));
	const hasMore = $derived(visibleWorkspaces.length < filteredWorkspaces.length);
	const labelByName = $derived.by(() => new Map(labelItems.map((label) => [label.name, label])));

	$effect(() => {
		filter;
		query;
		dateFrom;
		dateTo;
		visibleCount = chunkSize;
	});

	function setFilter(value: 'open' | 'changes' | 'ready' | 'merged' | 'closed' | 'all') {
		filter = value;
	}

	function baseName(workspace: WorkspaceStatus) {
		return workspace.parent_workspace ?? 'main';
	}

	function statusLabel(workspace: WorkspaceStatus) {
		if (workspace.status === 'merged') return 'merged';
		if (workspace.status === 'closed') return 'closed';
		if (workspace.status === 'not_planned') return 'not planned';
		if (workspace.status === 'changes_requested' || unresolvedCommentCounts[workspace.name]) return 'changes requested';
		if (workspace.is_ready) return workspace.mergeable ? 'ready' : 'ready, blocked';
		return 'draft';
	}

	function statusClass(workspace: WorkspaceStatus) {
		if (workspace.status === 'merged') return 'text-[#8c887e]';
		if (workspace.status === 'closed' || workspace.status === 'not_planned') return 'text-[#d96c5a]';
		if (workspace.status === 'changes_requested' || unresolvedCommentCounts[workspace.name]) return 'text-[#d9a66c]';
		if (workspace.is_ready && workspace.mergeable) return 'text-[#7cb97c]';
		if (workspace.is_ready) return 'text-[#d9a66c]';
		return 'text-[#a09d94]';
	}

	function StatusIcon(workspace: WorkspaceStatus) {
		if (workspace.status === 'merged') return GitMerge;
		if (workspace.status === 'changes_requested' || unresolvedCommentCounts[workspace.name]) return CircleDot;
		if (workspace.is_ready && workspace.mergeable) return CheckCircle2;
		if (workspace.is_ready) return CircleDot;
		return GitPullRequest;
	}

	function activityLabel(value?: string | null) {
		if (!value) return 'No activity';
		return new Date(value).toLocaleDateString();
	}

	function loadMore() {
		visibleCount = Math.min(visibleCount + chunkSize, filteredWorkspaces.length);
	}

	function matchesQuery(workspace: WorkspaceStatus) {
		const needle = query.trim().toLowerCase();
		if (!needle) return true;
		const haystack = [
			workspace.name,
			workspace.status,
			baseName(workspace),
			workspace.milestone ?? '',
			...(workspace.labels ?? [])
		].join(' ').toLowerCase();
		return haystack.includes(needle);
	}

	function sizeLabel(workspace: WorkspaceStatus) {
		const files = workspace.changed_file_count;
		const parts = [];
		if (files) parts.push(`${files} file${files === 1 ? '' : 's'}`);
		if (workspace.additions) parts.push(`+${workspace.additions}`);
		if (workspace.deletions) parts.push(`-${workspace.deletions}`);
		return parts.join(' ');
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 flex flex-wrap items-center gap-3">
		<div class="flex h-9 min-w-64 flex-1 items-center gap-2 border border-[#2a2a28] bg-[#141412] px-2.5 focus-within:border-[#d9a66c]">
			<Search class="h-3.5 w-3.5 shrink-0 text-[#6f6b5f]" />
			<input class="workspace-search-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] outline-none ring-0 placeholder:text-[#6f6b5f] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search workspaces" bind:value={query} />
		</div>
		<DateRangePicker bind:from={dateFrom} bind:to={dateTo} placeholder="Any activity date" />
		<a class="inline-flex h-9 items-center border border-[#2a2a28] bg-[#1e1e1c] px-3 text-sm text-[#eae9e4] hover:bg-[#2a2a28]" href="/{tenant}/{project}/issues/labels">Labels</a>
		<a class="inline-flex h-9 items-center border border-[#2a2a28] bg-[#1e1e1c] px-3 text-sm text-[#eae9e4] hover:bg-[#2a2a28]" href="/{tenant}/{project}/issues/milestones">Milestones</a>
	</div>

	<div class="border border-[#2a2a28] bg-[#0f0f0d]">
		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2a28] bg-[#141412] px-4 py-3">
			<div class="flex flex-wrap items-center gap-4 text-sm">
				{#each [
					{ id: 'open', label: 'Open', count: openWorkspaces.length },
					{ id: 'changes', label: 'Changes requested', count: changesRequestedWorkspaces.length },
					{ id: 'ready', label: 'Ready', count: readyWorkspaces.length },
					{ id: 'merged', label: 'Merged', count: mergedWorkspaces.length },
					{ id: 'closed', label: 'Closed', count: closedWorkspaces.length },
					{ id: 'all', label: 'All', count: workspaces.length }
				] as item (item.id)}
					<button
						class="{filter === item.id ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}"
						onclick={() => setFilter(item.id as 'open' | 'changes' | 'ready' | 'merged' | 'closed' | 'all')}
					>
						{item.label} <span class="ml-1 text-xs text-[#6f6b5f]">{item.count}</span>
					</button>
				{/each}
			</div>
			<div class="text-sm text-[#8c887e]">Newest</div>
		</div>

		{#if loading}
			<div class="p-8">
				<Spinner />
			</div>
		{:else if error}
			<div class="border-b border-[#2a2a28] bg-[#1a1110] px-4 py-3 text-sm text-[#d96c5a]">{error}</div>
		{:else if workspaces.length === 0}
			<div class="p-8 text-center">
				<p class="text-sm text-[#8c887e]">No workspaces yet.</p>
				<p class="mt-1 text-xs text-[#6f6b5f]">Create one with <code class="rounded bg-[#1e1e1c] px-1 py-0.5">pig work new</code>.</p>
			</div>
		{:else if filteredWorkspaces.length === 0}
			<div class="p-8 text-center">
				<p class="text-sm text-[#8c887e]">Nothing here.</p>
			</div>
		{:else}
			<div class="divide-y divide-[#252522]">
				{#each visibleWorkspaces as workspace (workspace.name)}
				{@const Icon = StatusIcon(workspace)}
				<button
					class="group grid w-full gap-2 px-4 py-3 text-left hover:bg-[#141412] md:grid-cols-[1fr_auto]"
					onclick={() => goto(`/${tenant}/${project}/workspaces/${workspace.name}`)}
				>
					<div class="min-w-0">
						<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
							<Icon class="h-4 w-4 shrink-0 {statusClass(workspace)}" />
							<span class="truncate text-sm font-medium text-[#eae9e4]">{workspace.name}</span>
							<span class="text-xs {statusClass(workspace)}">{statusLabel(workspace)}</span>
							{#each workspace.labels ?? [] as label (label)}
								<LabelBadge name={label} color={labelByName.get(label)?.color} />
							{/each}
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6f6b5f]">
							<span>{workspace.name} into {baseName(workspace)}</span>
							<span>{activityLabel(workspace.last_activity_at)}</span>
							{#if workspace.head}
								<span class="inline-flex items-center gap-1 font-mono"><GitCommit class="h-3 w-3" />{workspace.head.slice(0, 10)}</span>
							{/if}
							{#if workspace.milestone}
								<span>{workspace.milestone}</span>
							{/if}
							{#if sizeLabel(workspace)}
								<span class="inline-flex items-center gap-1">
									<FileDiff class="h-3.5 w-3.5" />{sizeLabel(workspace)}
								</span>
							{/if}
							<span class="inline-flex items-center gap-1">
								<MessageSquare class="h-3.5 w-3.5" />{unresolvedCommentCounts[workspace.name] ? `${unresolvedCommentCounts[workspace.name]} open` : commentCounts[workspace.name] ?? 0}
							</span>
							{#if workspace.child_workspaces.length}
								<span>{workspace.child_workspaces.length} child workspace{workspace.child_workspaces.length === 1 ? '' : 's'}</span>
							{/if}
						</div>
					</div>
					<div class="flex shrink-0 items-start text-xs text-[#6f6b5f]">
						<ChevronRight class="h-4 w-4 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
					</div>
				</button>
				{/each}
			</div>
		{/if}
	</div>
	{#if !loading && !error && filteredWorkspaces.length > 0}
		<InfiniteLoader active={hasMore} onVisible={loadMore} />
	{/if}
</div>

<style>
	.workspace-search-input:focus-visible {
		outline: none;
	}
</style>
