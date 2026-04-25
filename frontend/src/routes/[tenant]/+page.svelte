<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { listTenantProjects, type ProjectSummary } from '$lib/api';

	const tenant = $derived($page.params.tenant as string);

	let projects = $state<ProjectSummary[]>([]);
	let loading = $state(true);

	onMount(async () => {
		loading = true;
		projects = await listTenantProjects(tenant);
		loading = false;
	});
</script>

<div class="p-8">
	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else}
		<div class="mb-6">
			<h2 class="text-2xl font-semibold text-[#f0eee4]">{tenant}</h2>
			<p class="mt-1 text-sm text-[#8c887e]">{projects.length} projects</p>
		</div>

		{#if projects.length === 0}
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
				<p class="text-sm text-[#8c887e]">No projects in this tenant yet.</p>
			</div>
		{:else}
			<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				{#each projects as project}
					<button
						class="rounded border border-[#2a2a28] bg-[#141412] p-4 text-left transition-colors hover:border-[#3a3a36]"
						onclick={() => goto(`/${project.tenant}/${project.project}`)}
					>
						<div class="text-sm font-medium text-[#f0eee4]">{project.project}</div>
						<div class="mt-1 text-xs text-[#6f6b5f]">Owner: {project.owner}</div>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>
