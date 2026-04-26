<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAbortError, listProjects, getProjectOverview, type ProjectSummary, type ProjectOverview } from '$lib/api';
	import ActivityFeed from '$lib/components/ActivityFeed.svelte';
	import Spinner from '$lib/components/Spinner.svelte';

	let projects = $state<ProjectSummary[]>([]);
	let overviews = $state<Record<string, ProjectOverview>>({});
	let loading = $state(true);

	onMount(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const projectList = await listProjects({ signal: controller.signal });
				projects = projectList;
				const results = await Promise.all(
					projectList.slice(0, 5).map(async (p) => {
						try {
							const ov = await getProjectOverview(p.tenant, p.project, { signal: controller.signal });
							return [`${p.tenant}/${p.project}`, ov] as const;
						} catch (error) {
							if (isAbortError(error)) throw error;
							return null;
						}
					})
				);
				overviews = Object.fromEntries(results.filter((r) => r !== null));
				loading = false;
			} catch (error) {
				if (!isAbortError(error)) loading = false;
			}
		})();
		return () => controller.abort();
	});
</script>

<div class="p-8">
	<div class="mx-auto max-w-5xl">
		<h2 class="text-2xl font-semibold text-[#f0eee4]">Dashboard</h2>
		<p class="mt-1 text-sm text-[#8c887e]">Recent projects and activity.</p>

		{#if loading}
			<Spinner />
		{:else if projects.length === 0}
			<div class="mt-8 rounded border border-[#2a2a28] p-8 text-center">
				<p class="text-sm text-[#8c887e]">No projects yet.</p>
				<p class="mt-1 text-xs text-[#6f6b5f]">Create one from the sidebar.</p>
			</div>
		{:else}
			<div class="mt-6 grid gap-4 md:grid-cols-2">
				{#each projects as project}
					{@const slug = `${project.tenant}/${project.project}`}
					{@const ov = overviews[slug]}
					<button
						class="rounded border border-[#2a2a28] bg-[#141412] p-4 text-left transition-colors hover:border-[#3a3a36]"
						onclick={() => goto(`/${slug}`)}
					>
						<div class="flex items-center gap-2">
							<span class="font-medium text-[#f0eee4]">{project.tenant}</span>
							<span class="text-[#5c5c5a]">/</span>
							<span class="text-[#eae9e4]">{project.project}</span>
						</div>
						{#if ov}
							<div class="mt-2 flex flex-wrap gap-3 text-xs text-[#6f6b5f]">
								<span>{ov.stats.workspace_count} workspaces</span>
								<span>{ov.stats.issue_count} issues</span>
								<span>{ov.stats.open_ready_count} ready</span>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
