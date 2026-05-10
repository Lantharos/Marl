<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getProjectOverview, type ProjectOverview, type WorkspaceStatus, type ProjectSettings, type PanelItem, type Release } from '$lib/api';
	import { appData } from '$lib/appState';
	import ActivityFeed from '$lib/components/ActivityFeed.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ScreenshotImage from '$lib/components/ScreenshotImage.svelte';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import History from 'lucide-svelte/icons/history';
	import LockKeyhole from 'lucide-svelte/icons/lock-keyhole';
	import Tag from 'lucide-svelte/icons/tag';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let authedOverview = $state<ProjectOverview | null>(null);
	let loading = $state(false);
	let signedIn = $state(false);
	let authedLoadKey = '';

	const tenant = $derived(data.tenant);
	const project = $derived(data.project);
	const overview = $derived(authedOverview ?? data.overview);
	const workspaces = $derived<WorkspaceStatus[]>(overview?.workspaces ?? []);
	const panelWorkspaces = $derived(
		workspaces
			.filter((workspace) => workspace.name !== 'main' && isOpenWorkspace(workspace))
			.toSorted((left, right) => workspaceActivityTime(right) - workspaceActivityTime(left))
			.slice(0, 3)
	);
	const releases = $derived<Release[]>(overview?.releases ?? []);
	const readme = $derived<string | null>(overview?.readme ?? null);
	const featuredScreenshot = $derived(overview?.featured_screenshot ?? null);
	const settings = $derived<ProjectSettings | null>(overview?.settings ?? null);
	const stats = $derived(overview?.stats ?? null);

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

	const orderedPanels = $derived.by(() => {
		const panels = settings?.panels?.length ? settings.panels : DEFAULT_PANELS;
		return withDefaultPanels(panels).filter((p) => p.enabled).sort((a, b) => a.order - b.order);
	});
	const sidePanels = $derived(orderedPanels.filter((panel) => panel.type !== 'activity'));
	const showActivity = $derived(orderedPanels.some((panel) => panel.type === 'activity'));
	const projectStats = $derived.by(() => [
		{ label: 'Workspaces', value: stats?.workspace_count ?? 0, href: `/${tenant}/${project}/workspaces` },
		{ label: 'Issues', value: stats?.open_issue_count ?? 0, href: `/${tenant}/${project}/issues` },
		{ label: 'Releases', value: stats?.release_count ?? 0, href: `/${tenant}/${project}/releases` },
		{ label: 'History', value: stats?.history_count ?? 0, href: `/${tenant}/${project}/history` }
	]);

	function wsDotColor(ws: WorkspaceStatus) {
		if (ws.is_ready) return 'bg-[#7cb97c]';
		if (ws.status === 'merged') return 'bg-[#a09d94]';
		return 'bg-[#d9a66c]';
	}

	function isOpenWorkspace(workspace: WorkspaceStatus) {
		return workspace.is_ready || !['merged', 'closed', 'not_planned', 'deleted'].includes(workspace.status);
	}

	function workspaceActivityTime(workspace: WorkspaceStatus) {
		const time = workspace.last_activity_at ? Date.parse(workspace.last_activity_at) : 0;
		return Number.isFinite(time) ? time : 0;
	}

	function releaseTitle(release: Release) {
		return release.name?.trim() || release.tag;
	}

	function releaseDate(release: Release) {
		const value = release.created_at ?? release.updated_at;
		return value ? new Date(value).toLocaleDateString() : '';
	}

	function workspaceLabel(workspace: WorkspaceStatus) {
		if (workspace.is_ready) return 'ready';
		return workspace.status || 'open';
	}

	const unsubscribe = appData.subscribe((value) => {
		signedIn = Boolean(value.me);
		if (signedIn && !overview) void loadAuthedOverview();
	});

	onDestroy(unsubscribe);

	$effect(() => {
		authedOverview = null;
		authedLoadKey = '';
		loading = false;
		if (!data.overview && signedIn) void loadAuthedOverview();
	});

	function applyOverview(value: ProjectOverview | null) {
		authedOverview = value;
		loading = false;
	}

	async function loadAuthedOverview() {
		const key = `${tenant}/${project}`;
		if (authedLoadKey === key) return;
		authedLoadKey = key;
		loading = true;
		try {
			applyOverview(await getProjectOverview(tenant, project));
		} catch {
			applyOverview(null);
		}
	}
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
	<meta property="og:title" content={data.seo.title} />
	<meta property="og:description" content={data.seo.description} />
	<meta property="og:type" content="article" />
</svelte:head>

{#if loading}
	<Spinner />
{:else if overview}
	<div class="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
		<div class="min-w-0 space-y-5">
			{#if featuredScreenshot}
				<section class="min-w-0 border border-[#2a2a28] bg-[#141412]">
					<a class="block" href={`/${tenant}/${project}/screenshots`}>
						<ScreenshotImage src={featuredScreenshot.download_url} alt={featuredScreenshot.title ?? featuredScreenshot.name} class="aspect-[16/9]" />
					</a>
					<div class="flex min-h-10 items-center justify-between gap-3 border-t border-[#2a2a28] px-4">
						<div class="min-w-0 truncate text-sm text-[#eae9e4]">{featuredScreenshot.title || featuredScreenshot.name}</div>
						<a class="shrink-0 text-xs text-[#8c887e] hover:text-[#d9a66c]" href={`/${tenant}/${project}/screenshots`}>Gallery</a>
					</div>
				</section>
			{/if}

			{#if readme}
				<section class="min-w-0 border border-[#2a2a28] bg-[#141412]">
					<div class="flex min-h-11 items-center gap-2 border-b border-[#2a2a28] px-4">
						<BookOpen class="h-4 w-4 text-[#8c887e]" />
						<h2 class="text-sm font-medium text-[#eae9e4]">README.md</h2>
					</div>
					<div class="p-5">
						<Markdown source={readme} />
					</div>
				</section>
			{:else}
				<section class="border border-[#2a2a28] bg-[#141412]">
					<div class="flex min-h-11 items-center gap-2 border-b border-[#2a2a28] px-4">
						<BookOpen class="h-4 w-4 text-[#8c887e]" />
						<h2 class="text-sm font-medium text-[#eae9e4]">README.md</h2>
					</div>
					<div class="p-5">
						<p class="text-sm leading-relaxed text-[#a09d94]">
							PIG project hosted on sty. Use <code class="bg-[#1e1e1c] px-1 py-0.5 text-xs">sty init --target {tenant}/{project}</code> to sync.
						</p>
						<p class="mt-1 text-xs text-[#6f6b5f]">Add a README.md to show project documentation here.</p>
					</div>
				</section>
			{/if}

			{#if showActivity}
				<section class="border border-[#2a2a28] bg-[#141412]">
					<div class="flex min-h-11 items-center justify-between border-b border-[#2a2a28] px-4">
						<div class="flex items-center gap-2">
							<History class="h-4 w-4 text-[#8c887e]" />
							<h2 class="text-sm font-medium text-[#eae9e4]">Recent activity</h2>
						</div>
						<a class="text-xs text-[#8c887e] hover:text-[#d9a66c]" href={`/${tenant}/${project}/history`}>View history</a>
					</div>
					<div class="px-4">
						<ActivityFeed activities={overview.recent_activity} />
					</div>
				</section>
			{/if}
		</div>

		<aside class="flex h-fit flex-col border border-[#2a2a28] bg-[#141412]">
			<section class="border-b border-[#2a2a28] p-4">
				<div class="flex min-w-0 items-start justify-between gap-3">
					<div class="min-w-0">
						<h2 class="truncate text-sm font-medium text-[#eae9e4]">{tenant}/{project}</h2>
						<div class="mt-1 flex items-center gap-1.5 text-xs text-[#8c887e]">
							{#if settings?.visibility === 'private'}
								<LockKeyhole class="h-3.5 w-3.5" />
								<span>Private</span>
							{:else}
								<span>Public</span>
							{/if}
						</div>
					</div>
					{#if settings?.follower_count !== undefined}
						<div class="shrink-0 text-right">
							<div class="text-sm text-[#eae9e4]">{settings.follower_count}</div>
							<div class="text-[11px] text-[#6f6b5f]">followers</div>
						</div>
					{/if}
				</div>
				<div class="mt-4 grid grid-cols-2 border border-[#252522]">
					{#each projectStats as item (item.label)}
						<a class="border-b border-r border-[#252522] px-3 py-2 hover:bg-[#1a1a18] even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0" href={item.href}>
							<div class="text-sm text-[#eae9e4]">{item.value}</div>
							<div class="text-[11px] text-[#6f6b5f]">{item.label}</div>
						</a>
					{/each}
				</div>
			</section>

			{#each sidePanels as panel (panel.id)}
				<section class="border-b border-[#2a2a28] last:border-b-0">
					<div class="flex min-h-10 items-center justify-between gap-3 px-4">
						<h3 class="text-sm font-medium text-[#eae9e4]">{panel.title}</h3>
						{#if panel.type === 'workspaces'}
							<a class="text-xs text-[#8c887e] hover:text-[#d9a66c]" href={`/${tenant}/${project}/workspaces`}>All</a>
						{:else if panel.type === 'releases'}
							<a class="text-xs text-[#8c887e] hover:text-[#d9a66c]" href={`/${tenant}/${project}/releases`}>All</a>
						{/if}
					</div>
					<div class="border-t border-[#252522]">
						{#if panel.type === 'workspaces'}
							<div class="divide-y divide-[#252522]">
								{#each panelWorkspaces as ws (ws.name)}
									<a
										class="group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-[#1a1a18]"
										href={`/${tenant}/${project}/workspaces/${encodeURIComponent(ws.name)}`}
									>
										<span class="min-w-0">
											<span class="block truncate text-sm text-[#eae9e4]">{ws.name}</span>
											<span class="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#6f6b5f]">
												<span class="h-1.5 w-1.5 shrink-0 rounded-full {wsDotColor(ws)}"></span>
												{workspaceLabel(ws)}
											</span>
										</span>
										<ChevronRight class="h-4 w-4 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
									</a>
								{:else}
									<p class="px-4 py-3 text-xs text-[#6f6b5f]">No open workspaces.</p>
								{/each}
							</div>
						{:else if panel.type === 'releases'}
							<div class="divide-y divide-[#252522]">
								{#each releases.slice(0, 5) as release (release.id ?? release.tag)}
									<a
										class="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-4 py-2.5 hover:bg-[#1a1a18]"
										href={`/${tenant}/${project}/releases`}
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
										<ChevronRight class="mt-0.5 h-4 w-4 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
									</a>
								{:else}
									<p class="px-4 py-3 text-xs text-[#6f6b5f]">No releases yet.</p>
								{/each}
							</div>
						{:else if panel.type === 'text'}
							{#if panel.content}
								<div class="p-4 text-sm leading-relaxed text-[#a09d94]">
									<Markdown source={panel.content} />
								</div>
							{/if}
						{:else if panel.type === 'button'}
							{#if panel.url}
								{@const isExternal = panel.url.startsWith('http')}
								<a
									href={panel.url}
									class="m-4 inline-block bg-[#2a2a28] px-3 py-1.5 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]"
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
									class="m-4 inline-flex items-center text-xs text-[#a09d94] hover:text-[#d9a66c]"
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
								<div class="p-4 text-sm text-[#a09d94]">
									<Markdown source={panel.content} />
								</div>
							{/if}
						{/if}
					</div>
				</section>
			{/each}
		</aside>
	</div>
{:else}
	<div class="mx-auto max-w-6xl border border-[#2a2a28] bg-[#141412] p-8 text-center">
		<p class="text-sm text-[#8c887e]">{data.accessStatus === 404 ? 'Project not found.' : 'This project is private.'}</p>
	</div>
{/if}
