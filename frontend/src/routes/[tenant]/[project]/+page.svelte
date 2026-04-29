<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getProjectOverview, type ProjectOverview, type WorkspaceStatus, type ProjectSettings, type PanelItem, type Release } from '$lib/api';
	import ActivityFeed from '$lib/components/ActivityFeed.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Tag from 'lucide-svelte/icons/tag';
	import Spinner from '$lib/components/Spinner.svelte';

	let overview = $state<ProjectOverview | null>(null);
	let workspaces = $state<WorkspaceStatus[]>([]);
	let releases = $state<Release[]>([]);
	let readme = $state<string | null>(null);
	let settings = $state<ProjectSettings | null>(null);
	let loading = $state(true);

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	const DEFAULT_PANELS: PanelItem[] = [
		{ id: 'workspaces', title: 'Workspaces', type: 'workspaces', enabled: true, order: 0 },
		{ id: 'releases', title: 'Releases', type: 'releases', enabled: true, order: 1 },
		{ id: 'activity', title: 'Activity', type: 'activity', enabled: true, order: 2 }
	];

	function withDefaultPanels(items: PanelItem[]) {
		const merged = items.filter((item) => item.id !== 'stats' && (item.type as string) !== 'stats');
		for (const panel of DEFAULT_PANELS) {
			if (!merged.some((item) => item.id === panel.id)) {
				merged.push({ ...panel, order: merged.length });
			}
		}
		return merged;
	}

	const orderedPanels = $derived(() => {
		const panels = settings?.panels?.length ? settings.panels : DEFAULT_PANELS;
		return withDefaultPanels(panels).filter((p) => p.enabled).sort((a, b) => a.order - b.order);
	});

	function wsDotColor(ws: WorkspaceStatus) {
		if (ws.is_ready) return 'bg-[#7cb97c]';
		if (ws.status === 'merged') return 'bg-[#a09d94]';
		return 'bg-[#d9a66c]';
	}

	function releaseTitle(release: Release) {
		return release.name?.trim() || release.tag;
	}

	function releaseDate(release: Release) {
		const value = release.created_at ?? release.updated_at;
		return value ? new Date(value).toLocaleDateString() : '';
	}

	$effect(() => {
		const _tenant = tenant;
		const _project = project;
		if (!_tenant || !_project) return;
		loading = true;
		(async () => {
			try {
				const ov = await getProjectOverview(_tenant, _project);
				overview = ov;
				workspaces = ov.workspaces;
				releases = ov.releases ?? [];
				readme = ov.readme;
				settings = ov.settings;
			} catch {
				overview = null;
			} finally {
				loading = false;
			}
		})();
	});
</script>

{#if loading}
	<Spinner />
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
			{#each orderedPanels() as panel}
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
					<h3 class="text-sm font-semibold text-[#eae9e4]">{panel.title}</h3>
					<div class="mt-2">
						{#if panel.type === 'workspaces'}
							<div class="grid gap-1">
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
						{:else if panel.type === 'releases'}
							<div class="grid gap-1">
								{#each releases.slice(0, 5) as release}
									<button
										class="flex min-w-0 items-start gap-2 rounded bg-[#0f0f0d] px-2.5 py-2 text-left hover:bg-[#1a1a18]"
										onclick={() => goto(`/${tenant}/${project}/releases`)}
									>
										<Tag class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d9a66c]" />
										<span class="min-w-0 flex-1">
											<span class="block truncate text-sm text-[#eae9e4]">{releaseTitle(release)}</span>
											<span class="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-[#6f6b5f]">
												<span class="font-mono">{release.tag}</span>
												{#if releaseDate(release)}
													<span>{releaseDate(release)}</span>
												{/if}
											</span>
										</span>
									</button>
								{:else}
									<p class="text-xs text-[#6f6b5f]">No releases yet.</p>
								{/each}
							</div>
						{:else if panel.type === 'activity'}
							<div class="overflow-y-auto" style="max-height: 400px;">
								<ActivityFeed activities={overview.recent_activity} />
							</div>
						{:else if panel.type === 'text'}
							{#if panel.content}
								<div class="text-sm leading-relaxed text-[#a09d94]">
									<Markdown source={panel.content} />
								</div>
							{/if}
						{:else if panel.type === 'button'}
							{#if panel.url}
								{@const isExternal = panel.url.startsWith('http')}
								<a
									href={panel.url}
									class="inline-block rounded bg-[#2a2a28] px-3 py-1.5 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]"
									{...isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}}
								>
									{panel.button_label ?? panel.title}
								</a>
							{/if}
						{:else if panel.type === 'link'}
							{#if panel.url}
								{@const isExternal = panel.url.startsWith('http')}
								<a
									href={panel.url}
									class="text-xs text-[#a09d94] hover:text-[#d9a66c]"
									{...isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}}
								>
									{panel.content ?? panel.url}
									{#if isExternal}
										<ExternalLink class="ml-0.5 h-3 w-3" />
									{/if}
								</a>
							{/if}
						{:else if panel.type === 'info'}
							{#if panel.content}
								<div class="text-sm text-[#a09d94]">
									<Markdown source={panel.content} />
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
