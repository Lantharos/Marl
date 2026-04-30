<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		addTenantCollaborator,
		deleteTenantCollaborator,
		isAbortError,
		listTenantCollaborators,
		listTenantProjectCards,
		updateTenantCollaborator,
		type Collaborator,
		type CollaboratorRole,
		type Paginated,
		type ProjectDiscoveryItem
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import CollaboratorsPanel from '$lib/components/CollaboratorsPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let authedProjects = $state<Paginated<ProjectDiscoveryItem> | null>(null);
	let signedInTenantNames = $state<string[]>([]);
	let currentUser = $state('');
	let ownedTenantNames = $state<string[]>([]);
	let tenantCollaborators = $state<Collaborator[]>([]);
	let collaboratorBusy = $state(false);
	let collaboratorError = $state('');
	let authedLoadKey = '';
	let collaboratorLoadKey = '';

	const projects = $derived(authedProjects ?? data.projects);
	const canAccessTenant = $derived(signedInTenantNames.includes(data.tenant));
	const canManageTenant = $derived(ownedTenantNames.includes(data.tenant));
	const projectScope = $derived(projects.scope === 'all' || canAccessTenant ? 'all' : 'public');
	const projectScopeLabel = $derived(projectScope === 'all' ? 'Projects' : 'Public projects');

	const unsubscribe = appData.subscribe((value) => {
		signedInTenantNames = value.me?.tenants.map((tenant) => tenant.name) ?? [];
		ownedTenantNames = value.me?.tenants.filter((tenant) => tenant.owner === value.me?.user).map((tenant) => tenant.name) ?? [];
		currentUser = value.me?.user ?? '';
	});

	onDestroy(unsubscribe);

	$effect(() => {
		if (!canAccessTenant) {
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

	$effect(() => {
		const key = canAccessTenant ? `${data.tenant}:${currentUser}` : '';
		if (!key) {
			tenantCollaborators = [];
			collaboratorLoadKey = '';
			return;
		}
		if (collaboratorLoadKey === key) return;
		collaboratorLoadKey = key;
		const controller = new AbortController();
		void loadCollaborators(controller.signal);
		return () => controller.abort();
	});

	async function loadAccessibleProjects(signal: AbortSignal) {
		try {
			authedProjects = await listTenantProjectCards(data.tenant, data.query, {
				page: data.projects.page,
				perPage: data.projects.per_page,
				signal
			});
		} catch (error) {
			if (isAbortError(error)) return;
			authedProjects = null;
		}
	}

	async function loadCollaborators(signal?: AbortSignal) {
		try {
			tenantCollaborators = (await listTenantCollaborators(data.tenant, { all: true, signal })).items;
			collaboratorError = '';
		} catch (error) {
			if (isAbortError(error)) return;
			tenantCollaborators = [];
			collaboratorError = error instanceof Error ? error.message : 'Failed';
		}
	}

	async function withCollaboratorBusy(action: () => Promise<void>) {
		collaboratorBusy = true;
		collaboratorError = '';
		try {
			await action();
			await loadCollaborators();
		} catch (error) {
			collaboratorError = error instanceof Error ? error.message : 'Failed';
		} finally {
			collaboratorBusy = false;
		}
	}

	function addTenantUser(user: string, role: CollaboratorRole) {
		return withCollaboratorBusy(() => addTenantCollaborator(data.tenant, user, role).then(() => {}));
	}

	function updateTenantUser(user: string, role: CollaboratorRole) {
		return withCollaboratorBusy(() => updateTenantCollaborator(data.tenant, user, role).then(() => {}));
	}

	function removeTenantUser(user: string) {
		return withCollaboratorBusy(() => deleteTenantCollaborator(data.tenant, user));
	}

	function projectPath(project: { tenant: string; project: string }) {
		return `/${project.tenant}/${project.project}`;
	}

	function timestamp(value?: string | null) {
		if (!value) return null;
		return new Date(value).toLocaleDateString();
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
		<div class="mb-4 flex items-end justify-between gap-3">
			<div>
				<h2 class="text-2xl font-semibold text-[#f0eee4]">{data.tenant}</h2>
				<p class="mt-1 text-sm text-[#8c887e]">{projectScopeLabel}</p>
			</div>
			<form method="GET" class="flex w-full max-w-sm gap-2">
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
		</div>

		{#if projects.items.length === 0}
			<div class="mt-8 rounded border border-[#2a2a28] p-8 text-center">
				<p class="text-sm text-[#8c887e]">
					{data.query
						? `No ${projectScope === 'all' ? '' : 'public '}projects match that search.`
						: `No ${projectScope === 'all' ? '' : 'public '}projects in this tenant yet.`}
				</p>
			</div>
		{:else}
			<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				{#each projects.items as project}
					<a
						class="min-h-28 rounded border border-[#2a2a28] bg-[#141412] p-4 text-left hover:border-[#3a3a36] hover:bg-[#1a1a18]"
						href={projectPath(project)}
					>
						<div class="truncate text-sm font-medium text-[#f0eee4]">{project.project}</div>
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

		{#if canAccessTenant}
			<div class="mt-6 grid gap-3">
				{#if collaboratorError}
					<div class="text-sm text-[#d96c5a]">{collaboratorError}</div>
				{/if}
				<CollaboratorsPanel
					title="Tenant collaborators"
					description="Tenant access applies to every project in this namespace."
					collaborators={tenantCollaborators}
					canManage={canManageTenant}
					busy={collaboratorBusy}
					onAdd={addTenantUser}
					onUpdate={updateTenantUser}
					onRemove={removeTenantUser}
				/>
			</div>
		{/if}
	</div>
</div>
