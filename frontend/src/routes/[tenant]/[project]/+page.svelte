<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getProjectOverview, listWorkspaceStatuses, getProjectReadme, type ProjectOverview, type WorkspaceStatus } from '$lib/api';
	import ActivityFeed from '$lib/components/ActivityFeed.svelte';
	import Markdown from '$lib/components/Markdown.svelte';

	let overview = $state<ProjectOverview | null>(null);
	let workspaces = $state<WorkspaceStatus[]>([]);
	let readme = $state<string | null>(null);
	let loading = $state(true);

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	function wsDotColor(ws: WorkspaceStatus) {
		if (ws.is_ready) return 'bg-[#7cb97c]';
		if (ws.status === 'merged') return 'bg-[#a09d94]';
		return 'bg-[#d9a66c]';
	}

	onMount(async () => {
		loading = true;
		try {
			const [ov, ws, rd] = await Promise.all([
				getProjectOverview(tenant, project),
				listWorkspaceStatuses(tenant, project),
				getProjectReadme(tenant, project)
			]);
			overview = ov;
			workspaces = ws;
			readme = rd;
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="text-sm text-[#6f6b5f]">Loading...</div>
{:else if overview}
	<div class="grid gap-6 lg:grid-cols-[1fr_300px]">
		<div>
			{#if readme}
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
					<Markdown source={readme} />
				</div>
			{:else}
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
					<h3 class="text-sm font-semibold text-[#f0eee4]">About</h3>
					<p class="mt-2 text-sm leading-relaxed text-[#a09d94]">
						PIG project hosted on sty. Use <code class="rounded bg-[#1e1e1c] px-1 py-0.5 text-xs">sty init {tenant}/{project}</code> to sync.
					</p>
					<p class="mt-1 text-xs text-[#6f6b5f]">Add a README.md to show project documentation here.</p>
				</div>
			{/if}
		</div>

		<div class="flex h-fit flex-col gap-4">
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Stats</h3>
				<div class="mt-2 grid grid-cols-2 gap-2">
					<div class="rounded bg-[#0f0f0d] p-2 text-center">
						<div class="text-base font-semibold text-[#f0eee4]">{overview.stats.workspace_count}</div>
						<div class="text-[10px] uppercase tracking-wide text-[#6f6b5f]">Workspaces</div>
					</div>
					<div class="rounded bg-[#0f0f0d] p-2 text-center">
						<div class="text-base font-semibold text-[#f0eee4]">{overview.stats.issue_count}</div>
						<div class="text-[10px] uppercase tracking-wide text-[#6f6b5f]">Issues</div>
					</div>
					<div class="rounded bg-[#0f0f0d] p-2 text-center">
						<div class="text-base font-semibold text-[#f0eee4]">{overview.stats.open_ready_count}</div>
						<div class="text-[10px] uppercase tracking-wide text-[#6f6b5f]">Ready</div>
					</div>
					<div class="rounded bg-[#0f0f0d] p-2 text-center">
						<div class="text-base font-semibold text-[#f0eee4]">{overview.stats.star_count}</div>
						<div class="text-[10px] uppercase tracking-wide text-[#6f6b5f]">Stars</div>
					</div>
				</div>
			</div>

			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Workspaces</h3>
				<div class="mt-2 grid gap-1">
					{#each workspaces.filter((w) => w.name !== 'main') as ws}
						<button
							class="flex items-center justify-between rounded bg-[#0f0f0d] px-2.5 py-1.5 text-left text-sm hover:bg-[#1a1a18]"
							onclick={() => goto(`/${tenant}/${project}/workspaces/${ws.name}`)}
						>
							<span class="text-[#eae9e4]">{ws.name}</span>
							<span class="flex items-center gap-2">
								<span class="text-xs text-[#6f6b5f]">{ws.head?.slice(0, 8) ?? 'empty'}</span>
								<span class="h-1.5 w-1.5 rounded-full {wsDotColor(ws)}" title={ws.status}></span>
							</span>
						</button>
					{:else}
						<p class="text-xs text-[#6f6b5f]">No workspaces yet.</p>
					{/each}
				</div>
			</div>

			<div class="flex-1 rounded border border-[#2a2a28] bg-[#141412] p-4 min-h-0">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Activity</h3>
				<div class="mt-2 overflow-y-auto" style="max-height: 400px;">
					<ActivityFeed activities={overview.recent_activity} />
				</div>
			</div>
		</div>
	</div>
{/if}
