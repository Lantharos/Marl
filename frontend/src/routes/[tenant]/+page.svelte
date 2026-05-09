<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		createTenantFolder,
		getUserProfilePage,
		isAbortError,
		listAccessibleTenantFolders,
		listAccessibleTenantProjectCards,
		listTenantFolders,
		moveProjectToFolder,
		type Paginated,
		type ProjectDiscoveryItem,
		type TenantFolder
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import UserProfileOverview from '$lib/components/UserProfileOverview.svelte';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Folder from 'lucide-svelte/icons/folder';
	import FolderPlus from 'lucide-svelte/icons/folder-plus';
	import Plus from 'lucide-svelte/icons/plus';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let authedProjects = $state<Paginated<ProjectDiscoveryItem> | null>(null);
	let localProjects = $state<Paginated<ProjectDiscoveryItem> | null>(null);
	let profilePage = $state<typeof data.profile>(null);
	let folders = $state<TenantFolder[]>([]);
	let signedInTenantNames = $state<string[]>([]);
	let authedLoadKey = '';
	let folderLoadTenant = '';
	let draggedProject = $state<ProjectDiscoveryItem | null>(null);
	let dragTarget = $state<string | null>(null);
	let newFolderParent = $state<string | null | undefined>(undefined);
	let newFolderName = $state('');
	let folderBusy = $state(false);
	let folderError = $state('');
	let expandedFolders = $state<string[]>([]);

	const projects = $derived(localProjects ?? authedProjects ?? data.projects);
	const visibleProfilePage = $derived(profilePage ?? data.profile);
	const canAccessTenant = $derived(signedInTenantNames.includes(data.tenant));
	const projectScope = $derived(projects.scope === 'all' || canAccessTenant ? 'all' : 'public');
	const rootProjects = $derived(projects.items.filter((project) => !normalizeFolderPath(project.folder)));
	const folderRows = $derived(folderTree(folders, projects.items));

	const unsubscribe = appData.subscribe((value) => {
		signedInTenantNames = value.me?.tenants.map((tenant) => tenant.name) ?? [];
	});

	onDestroy(unsubscribe);

	$effect(() => {
		if (folderLoadTenant === data.tenant) return;
		folders = data.folders;
		profilePage = data.profile;
		folderLoadTenant = data.tenant;
	});

	$effect(() => {
		if (!canAccessTenant || data.projects.scope === 'all') {
			authedProjects = null;
			authedLoadKey = '';
			return;
		}
		const key = `${data.tenant}:${data.query}:${data.projects.page}:${data.projects.per_page}`;
		if (authedLoadKey === key) return;
		authedLoadKey = key;
		const controller = new AbortController();
		void loadAccessibleProjects(controller.signal);
		return () => controller.abort();
	});

	async function loadAccessibleProjects(signal: AbortSignal) {
		try {
			const [projectPage, tenantFolders] = await Promise.all([
				listAccessibleTenantProjectCards(data.tenant, data.query, {
					page: data.projects.page,
					perPage: data.projects.per_page,
					signal
				}),
				listAccessibleTenantFolders(data.tenant, { signal }),
				getUserProfilePage(data.tenant, { signal }).then((profile) => {
					profilePage = profile;
				})
			]);
			authedProjects = projectPage;
			folders = tenantFolders;
			localProjects = null;
		} catch (error) {
			if (isAbortError(error)) return;
			authedProjects = null;
		}
	}

	function projectPath(project: { tenant: string; project: string }) {
		return `/${project.tenant}/${project.project}`;
	}

	function projectLabel(project: ProjectDiscoveryItem) {
		return project.project;
	}

	function timestamp(value?: string | null) {
		if (!value) return null;
		return new Date(value).toLocaleDateString();
	}

	function folderTree(folderItems: TenantFolder[], items: ProjectDiscoveryItem[]) {
		const paths = new Set(folderItems.map((folder) => normalizeFolderPath(folder.path)).filter(Boolean));
		for (const project of items) {
			for (const path of folderAncestors(project.folder)) paths.add(path);
		}
		return [...paths]
			.sort((a, b) => a.localeCompare(b))
			.map((path) => ({
				path,
				name: path.split('/').at(-1) ?? path,
				depth: path.split('/').length - 1,
				items: items.filter((project) => normalizeFolderPath(project.folder) === path),
				totalItems: items.filter((project) => folderAncestors(project.folder).includes(path)).length
			}));
	}

	function normalizeFolderPath(value?: string | null) {
		return value
			?.split('/')
			.map((part) => part.trim())
			.filter(Boolean)
			.join('/') ?? '';
	}

	function folderAncestors(value?: string | null) {
		const parts = normalizeFolderPath(value).split('/').filter(Boolean);
		const paths: string[] = [];
		for (let i = 0; i < parts.length; i += 1) {
			paths.push(parts.slice(0, i + 1).join('/'));
		}
		return paths;
	}

	function startCreateFolder(parent: string | null = null) {
		if (!canAccessTenant) return;
		if (parent) expandFolder(parent);
		newFolderParent = parent;
		newFolderName = '';
		folderError = '';
	}

	async function createFolder() {
		const name = newFolderName.trim();
		if (!name || folderBusy) return;
		const path = newFolderParent ? `${newFolderParent}/${name}` : name;
		folderBusy = true;
		folderError = '';
		try {
			await createTenantFolder(data.tenant, path);
			folders = await listTenantFolders(data.tenant);
			if (newFolderParent) expandFolder(newFolderParent);
			newFolderParent = undefined;
			newFolderName = '';
		} catch (error) {
			folderError = error instanceof Error ? error.message : 'Could not create folder';
		} finally {
			folderBusy = false;
		}
	}

	function cancelCreateFolder() {
		newFolderParent = undefined;
		newFolderName = '';
		folderError = '';
	}

	function projectDragStart(event: DragEvent, project: ProjectDiscoveryItem) {
		if (!canAccessTenant) {
			event.preventDefault();
			return;
		}
		draggedProject = project;
		event.dataTransfer?.setData('text/plain', project.project);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function dragOverFolder(event: DragEvent, folder: string | null) {
		if (!draggedProject || !canAccessTenant) return;
		event.preventDefault();
		dragTarget = folder ?? '';
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function leaveDropTarget(folder: string | null) {
		if (dragTarget === (folder ?? '')) dragTarget = null;
	}

	async function dropProject(event: DragEvent, folder: string | null) {
		event.preventDefault();
		if (!draggedProject || !canAccessTenant) return;
		const target = normalizeFolderPath(folder);
		if (normalizeFolderPath(draggedProject.folder) === target) {
			draggedProject = null;
			dragTarget = null;
			return;
		}
		const project = draggedProject;
		draggedProject = null;
		dragTarget = null;
		try {
			const moved = await moveProjectToFolder(data.tenant, project.project, target || null);
			replaceProject({ ...project, folder: moved.folder ?? null });
			folders = await listTenantFolders(data.tenant);
			if (target) expandFolder(target);
		} catch (error) {
			folderError = error instanceof Error ? error.message : 'Could not move project';
		}
	}

	function isFolderExpanded(path: string) {
		return expandedFolders.includes(path);
	}

	function expandFolder(path: string) {
		if (expandedFolders.includes(path)) return;
		expandedFolders = [...expandedFolders, path];
	}

	function toggleFolder(path: string) {
		expandedFolders = expandedFolders.includes(path)
			? expandedFolders.filter((folder) => folder !== path)
			: [...expandedFolders, path];
	}

	function folderRowKeydown(event: KeyboardEvent, path: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		toggleFolder(path);
	}

	function folderVisible(path: string) {
		const parts = normalizeFolderPath(path).split('/').filter(Boolean);
		if (parts.length <= 1) return true;
		for (let i = 1; i < parts.length; i += 1) {
			if (!expandedFolders.includes(parts.slice(0, i).join('/'))) return false;
		}
		return true;
	}

	function replaceProject(project: ProjectDiscoveryItem) {
		const source = projects;
		localProjects = {
			...source,
			items: source.items.map((item) =>
				item.tenant === project.tenant && item.project === project.project ? project : item
			)
		};
	}

	function finishDrag() {
		draggedProject = null;
		dragTarget = null;
	}

	function folderInputKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') void createFolder();
		if (event.key === 'Escape') cancelCreateFolder();
	}

	function folderMargin(depth: number) {
		return `${Math.min(depth, 6) * 1.25}rem`;
	}

	function projectCountLabel(count: number) {
		return count === 1 ? '1 project' : `${count} projects`;
	}

	function pageHref(page: number) {
		const params = new URLSearchParams();
		params.set('page', String(page));
		if (data.query) params.set('q', data.query);
		return `/${data.tenant}?${params}`;
	}
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
	<meta property="og:title" content={data.seo.title} />
	<meta property="og:description" content={data.seo.description} />
	<meta property="og:type" content="profile" />
</svelte:head>

<div class="p-8">
	<div class="mx-auto max-w-5xl">
		{#if visibleProfilePage}
			<UserProfileOverview profile={visibleProfilePage} />
		{/if}
		{#if !visibleProfilePage}
		<div class="mb-4">
			<h2 class="text-2xl font-semibold text-[#f0eee4]">{data.tenant}</h2>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<form method="GET" class="flex w-full max-w-md gap-2">
					<input
						class="h-9 min-w-0 flex-1 rounded border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a36]"
						name="q"
						placeholder="Search projects"
						value={data.query}
					/>
					<button class="rounded border border-[#2a2a28] px-3 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]">
						Search
					</button>
				</form>
				{#if canAccessTenant}
					<button
						class="inline-flex h-9 items-center gap-1 rounded border border-[#2a2a28] px-3 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
						onclick={() => startCreateFolder(null)}
					>
						<FolderPlus class="h-4 w-4" />
						New folder
					</button>
				{/if}
			</div>
			{#if newFolderParent === null && canAccessTenant}
				<div class="mt-3 flex max-w-md gap-2">
					<input
						class="h-9 min-w-0 flex-1 rounded border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a36]"
						placeholder="Folder name"
						bind:value={newFolderName}
						onkeydown={folderInputKeydown}
					/>
					<button
						class="rounded bg-[#eae9e4] px-3 text-sm font-medium text-[#0f0f0d] disabled:opacity-50"
						disabled={folderBusy || !newFolderName.trim()}
						onclick={createFolder}
					>
						Create
					</button>
					<button class="rounded px-3 text-sm text-[#8c887e] hover:text-[#eae9e4]" onclick={cancelCreateFolder}>Cancel</button>
				</div>
			{/if}
			{#if folderError}
				<p class="mt-2 text-sm text-[#d96c5a]">{folderError}</p>
			{/if}
		</div>

		<div
			class="min-h-20"
			role="region"
			aria-label="Tenant projects"
			ondragover={(event) => dragOverFolder(event, null)}
			ondragleave={() => leaveDropTarget(null)}
			ondrop={(event) => dropProject(event, null)}
		>
		{#if projects.items.length === 0 && folderRows.length === 0}
			<div class="mt-8 rounded border border-[#2a2a28] p-8 text-center">
				<p class="text-sm text-[#8c887e]">
					{data.query
						? `No ${projectScope === 'all' ? '' : 'public '}projects match that search.`
						: `No ${projectScope === 'all' ? '' : 'public '}projects in this tenant yet.`}
				</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#if rootProjects.length > 0}
					<section class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
						{#each rootProjects as project (`${project.tenant}/${project.project}`)}
							<a
								class="min-h-28 rounded border border-[#2a2a28] bg-[#141412] p-4 text-left hover:border-[#3a3a36] hover:bg-[#1a1a18]"
								href={projectPath(project)}
								draggable={canAccessTenant}
								ondragstart={(event) => projectDragStart(event, project)}
								ondragend={finishDrag}
							>
								<div class="truncate text-sm font-medium text-[#f0eee4]">{projectLabel(project)}</div>
								<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6f6b5f]">
									<span>{project.stats.workspace_count} workspaces</span>
									<span>{project.stats.open_issue_count} issues</span>
									<span>{project.stats.release_count} releases</span>
								</div>
								{#if timestamp(project.last_activity_at)}
									<div class="mt-5 text-xs text-[#6f6b5f]">{timestamp(project.last_activity_at)}</div>
								{/if}
							</a>
						{/each}
					</section>
				{/if}

				{#each folderRows as folder (folder.path)}
					{#if folderVisible(folder.path)}
					<section
						class="rounded border border-[#2a2a28] bg-[#141412] {dragTarget === folder.path ? 'border-[#d9a66c]' : ''}"
						style:margin-left={folderMargin(folder.depth)}
						role="group"
						aria-label={`${folder.path} folder`}
						ondragover={(event) => dragOverFolder(event, folder.path)}
						ondragleave={() => leaveDropTarget(folder.path)}
						ondrop={(event) => dropProject(event, folder.path)}
					>
						<div
							class="flex cursor-pointer items-center justify-between gap-3 border-b border-[#252522] px-4 py-3 hover:bg-[#1a1a18]"
							role="button"
							tabindex="0"
							aria-expanded={isFolderExpanded(folder.path)}
							onclick={() => toggleFolder(folder.path)}
							onkeydown={(event) => folderRowKeydown(event, folder.path)}
						>
							<div class="flex min-w-0 items-center gap-2">
								<span class="grid h-7 w-7 shrink-0 place-items-center rounded text-[#8c887e]">
									<ChevronRight class="h-4 w-4 transition-transform {isFolderExpanded(folder.path) ? 'rotate-90' : ''}" />
								</span>
								<Folder class="h-4 w-4 shrink-0 text-[#d9a66c]" />
								<div class="min-w-0">
									<div class="truncate text-sm font-medium text-[#f0eee4]">{folder.name}</div>
									<div class="mt-0.5 text-xs text-[#6f6b5f]">{projectCountLabel(folder.totalItems)}</div>
								</div>
							</div>
							{#if canAccessTenant}
								<button
									class="grid h-8 w-8 place-items-center rounded text-[#8c887e] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
									title="New folder"
									onclick={(event) => {
										event.stopPropagation();
										startCreateFolder(folder.path);
									}}
								>
									<Plus class="h-4 w-4" />
								</button>
							{/if}
						</div>
						{#if isFolderExpanded(folder.path) && newFolderParent === folder.path && canAccessTenant}
							<div class="flex gap-2 border-b border-[#252522] px-4 py-3">
								<input
									class="h-9 min-w-0 flex-1 rounded border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a36]"
									placeholder="Folder name"
									bind:value={newFolderName}
									onkeydown={folderInputKeydown}
								/>
								<button
									class="rounded bg-[#eae9e4] px-3 text-sm font-medium text-[#0f0f0d] disabled:opacity-50"
									disabled={folderBusy || !newFolderName.trim()}
									onclick={createFolder}
								>
									Create
								</button>
								<button class="rounded px-3 text-sm text-[#8c887e] hover:text-[#eae9e4]" onclick={cancelCreateFolder}>Cancel</button>
							</div>
						{/if}
						{#if isFolderExpanded(folder.path)}
							<div class="grid gap-3 p-3 md:grid-cols-2 lg:grid-cols-3">
								{#each folder.items as project (`${project.tenant}/${project.project}`)}
									<a
										class="min-h-24 rounded border border-[#252522] bg-[#0f0f0d] p-4 text-left hover:border-[#3a3a36] hover:bg-[#1a1a18]"
										href={projectPath(project)}
										draggable={canAccessTenant}
										ondragstart={(event) => projectDragStart(event, project)}
										ondragend={finishDrag}
									>
										<div class="truncate text-sm font-medium text-[#f0eee4]">{projectLabel(project)}</div>
										<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6f6b5f]">
											<span>{project.stats.workspace_count} workspaces</span>
											<span>{project.stats.open_issue_count} issues</span>
											<span>{project.stats.release_count} releases</span>
										</div>
									</a>
								{:else}
									<p class="px-1 py-3 text-sm text-[#6f6b5f]">Drop projects here.</p>
								{/each}
							</div>
						{/if}
					</section>
					{/if}
				{/each}
			</div>

			{#if projects.total_pages > 1}
				<div class="mt-4 flex items-center justify-between text-xs text-[#6f6b5f]">
					<span>Page {projects.page} of {projects.total_pages}</span>
					<div class="flex gap-2">
						<a
							class="rounded border border-[#2a2a28] px-3 py-1.5 text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4] aria-disabled:pointer-events-none aria-disabled:text-[#4b4841]"
							href={projects.prev ? pageHref(projects.prev) : undefined}
							aria-disabled={!projects.prev}
						>
							Previous
						</a>
						<a
							class="rounded border border-[#2a2a28] px-3 py-1.5 text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4] aria-disabled:pointer-events-none aria-disabled:text-[#4b4841]"
							href={projects.next ? pageHref(projects.next) : undefined}
							aria-disabled={!projects.next}
						>
							Next
						</a>
					</div>
				</div>
			{/if}
		{/if}
		</div>
		{/if}

	</div>
</div>
