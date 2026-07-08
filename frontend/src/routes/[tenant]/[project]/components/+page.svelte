<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import {
		getComponentOverview,
		isAbortError,
		type CiJob,
		type ProjectComponentOverview
	} from '$lib/api';
	import Spinner from '$lib/components/Spinner.svelte';
	import CircleDot from 'lucide-svelte/icons/circle-dot';
	import GitCommit from 'lucide-svelte/icons/git-commit';
	import Tag from 'lucide-svelte/icons/tag';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let loading = $state(true);
	let error = $state('');
	let rows = $state<ProjectComponentOverview[]>([]);
	let canViewCi = $state(false);
	let selectedComponent = $state('all');

	const filteredRows = $derived(selectedComponent === 'all' ? rows : rows.filter((row) => row.component.id === selectedComponent));

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const overview = await getComponentOverview(tenant, project, { signal });
			rows = overview.components;
			canViewCi = overview.can_view_ci;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	function jobClass(job: CiJob | null) {
		if (!job) return 'text-[#6f6b5f]';
		if (job.status !== 'completed') return 'text-[#d9a66c]';
		if (job.conclusion === 'success' || job.conclusion === 'skipped') return 'text-[#7cb97c]';
		return 'text-[#d96c5a]';
	}

	function jobLabel(job: CiJob | null) {
		if (!job) return 'no CI';
		if (job.status !== 'completed') return job.status.replace('_', ' ');
		return job.conclusion ?? 'completed';
	}

	function date(value?: string | null) {
		return value ? new Date(value).toLocaleDateString() : '';
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 grid gap-1">
		<h2 class="text-base font-semibold text-[#f0eee4]">Components</h2>
		<p class="text-sm text-[#6f6b5f]">Owned slices of this project with issues, releases, CI, and history.</p>
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if !rows.length}
		<div class="border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">No components configured.</p>
		</div>
	{:else}
		<div class="mb-4 flex flex-wrap gap-1 border-b border-[#2a2a28]">
			<button class="px-3 py-2 text-sm {selectedComponent === 'all' ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (selectedComponent = 'all')}>
				All <span class="ml-1 text-xs text-[#6f6b5f]">{rows.length}</span>
			</button>
			{#each rows as row (row.component.id)}
				<button class="px-3 py-2 text-sm {selectedComponent === row.component.id ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (selectedComponent = row.component.id)}>
					{row.component.name}
				</button>
			{/each}
		</div>

		<div class="grid gap-3">
			{#each filteredRows as row (row.component.id)}
				{@const component = row.component}
				{@const latestRelease = row.latest_release ?? null}
				{@const latestJob = row.latest_job ?? null}
				{@const openIssues = row.open_issues}
				{@const recentHistory = row.recent_history}
				<div class="border border-[#252522] bg-[#0f0f0d]">
					<div class="grid gap-3 border-b border-[#252522] px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
						<div class="min-w-0">
							<div class="flex flex-wrap items-baseline gap-2">
								<h3 class="text-sm font-medium text-[#eae9e4]">{component.name}</h3>
								<span class="font-mono text-xs text-[#6f6b5f]">{component.id}</span>
							</div>
							<div class="mt-1 flex flex-wrap gap-2 text-xs text-[#8c887e]">
								<span>{component.paths.join(', ')}</span>
								{#if component.owners?.length}<span>owners {component.owners.map((owner) => `@${owner}`).join(', ')}</span>{/if}
								{#if component.depends_on?.length}<span>depends on {component.depends_on.join(', ')}</span>{/if}
							</div>
						</div>
						<div class="grid grid-cols-3 gap-4 text-right text-xs">
							<div><span class="block text-[#6f6b5f]">Issues</span><span class="text-[#eae9e4]">{row.open_issue_count}</span></div>
							<div><span class="block text-[#6f6b5f]">Release</span><span class="font-mono text-[#d9a66c]">{latestRelease?.tag ?? 'none'}</span></div>
							<div><span class="block text-[#6f6b5f]">CI</span><span class={jobClass(latestJob)}>{canViewCi ? jobLabel(latestJob) : 'private'}</span></div>
						</div>
					</div>
					<div class="grid gap-4 px-4 py-3 md:grid-cols-3">
						<div>
							<div class="mb-2 flex items-center gap-1.5 text-xs text-[#8c887e]"><CircleDot class="h-3.5 w-3.5" /> Open issues</div>
							{#each openIssues.slice(0, 3) as issue (issue.id)}
								<a class="block truncate py-0.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" href={resolve('/[tenant]/[project]/issues/[issue]', { tenant, project, issue: String(issue.number) })}>#{issue.number} {issue.title}</a>
							{:else}
								<div class="text-xs text-[#6f6b5f]">No open issues.</div>
							{/each}
						</div>
						<div>
							<div class="mb-2 flex items-center gap-1.5 text-xs text-[#8c887e]"><Tag class="h-3.5 w-3.5" /> Release lane</div>
							{#if latestRelease}
								<a class="block truncate font-mono text-xs text-[#d9a66c] hover:text-[#e6bd86]" href={resolve('/[tenant]/[project]/releases/[release]/edit', { tenant, project, release: latestRelease.id ?? latestRelease.tag })}>{latestRelease.tag}</a>
								<div class="mt-1 text-xs text-[#6f6b5f]">{date(latestRelease.created_at ?? latestRelease.updated_at)}</div>
							{:else}
								<div class="text-xs text-[#6f6b5f]">No component release.</div>
							{/if}
						</div>
						<div>
							<div class="mb-2 flex items-center gap-1.5 text-xs text-[#8c887e]"><GitCommit class="h-3.5 w-3.5" /> Recent history</div>
							{#each recentHistory as entry (entry.id)}
								<a class="block truncate py-0.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" href={resolve('/[tenant]/[project]/history/[entryId]', { tenant, project, entryId: entry.id })}>{entry.message || entry.kind}</a>
							{:else}
								<div class="text-xs text-[#6f6b5f]">No component history yet.</div>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
