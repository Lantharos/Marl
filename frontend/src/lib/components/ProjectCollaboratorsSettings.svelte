<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		addProjectCollaborator,
		addTenantCollaborator,
		deleteProjectCollaborator,
		deleteTenantCollaborator,
		isAbortError,
		listProjectCollaborators,
		listTenantCollaborators,
		updateProjectCollaborator,
		updateTenantCollaborator,
		type AccessResponse,
		type Collaborator,
		type CollaboratorRole
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import CollaboratorsPanel from '$lib/components/CollaboratorsPanel.svelte';

	let {
		tenant,
		project,
		access
	}: {
		tenant: string;
		project: string;
		access: AccessResponse | null;
	} = $props();

	let projectCollaborators = $state<Collaborator[]>([]);
	let tenantCollaborators = $state<Collaborator[] | null>(null);
	let currentUser = $state('');
	let busy = $state(false);
	let error = $state('');
	let loadKey = '';

	const unsubscribe = appData.subscribe((value) => {
		currentUser = value.me?.user ?? '';
	});

	onDestroy(unsubscribe);

	const canManageProject = $derived(Boolean(access?.can_maintain));
	const canManageTenant = $derived(
		Boolean(currentUser && tenantCollaborators?.some((item) => item.user === currentUser && item.role === 'owner'))
	);

	$effect(() => {
		const key = canManageProject ? `${tenant}/${project}` : '';
		if (!key || key === loadKey) return;
		loadKey = key;
		const controller = new AbortController();
		void load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		error = '';
		try {
			const [projectResult, tenantResult] = await Promise.all([
				listProjectCollaborators(tenant, project, { all: true, signal }),
				listTenantCollaborators(tenant, { all: true, signal }).catch(() => null)
			]);
			projectCollaborators = projectResult.items;
			tenantCollaborators = tenantResult?.items ?? null;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function refresh() {
		const [projectResult, tenantResult] = await Promise.all([
			listProjectCollaborators(tenant, project, { all: true }),
			listTenantCollaborators(tenant, { all: true }).catch(() => null)
		]);
		projectCollaborators = projectResult.items;
		tenantCollaborators = tenantResult?.items ?? null;
	}

	async function withBusy(action: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await action();
			await refresh();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	function addProjectUser(user: string, role: CollaboratorRole) {
		return withBusy(() => addProjectCollaborator(tenant, project, user, role).then(() => {}));
	}

	function updateProjectUser(user: string, role: CollaboratorRole) {
		return withBusy(() => updateProjectCollaborator(tenant, project, user, role).then(() => {}));
	}

	function removeProjectUser(user: string) {
		return withBusy(() => deleteProjectCollaborator(tenant, project, user));
	}

	function addTenantUser(user: string, role: CollaboratorRole) {
		return withBusy(() => addTenantCollaborator(tenant, user, role).then(() => {}));
	}

	function updateTenantUser(user: string, role: CollaboratorRole) {
		return withBusy(() => updateTenantCollaborator(tenant, user, role).then(() => {}));
	}

	function removeTenantUser(user: string) {
		return withBusy(() => deleteTenantCollaborator(tenant, user));
	}
</script>

{#if error}
	<div class="text-sm text-[#d96c5a]">{error}</div>
{/if}

<CollaboratorsPanel
	title="Project collaborators"
	description="People added here can work on this project without getting access to the rest of the tenant."
	collaborators={projectCollaborators}
	canManage={canManageProject}
	{busy}
	onAdd={addProjectUser}
	onUpdate={updateProjectUser}
	onRemove={removeProjectUser}
/>

{#if tenantCollaborators}
	<CollaboratorsPanel
		title="Tenant collaborators"
		description="Tenant access applies to every project in this namespace."
		collaborators={tenantCollaborators}
		canManage={canManageTenant}
		{busy}
		onAdd={addTenantUser}
		onUpdate={updateTenantUser}
		onRemove={removeTenantUser}
	/>
{/if}
