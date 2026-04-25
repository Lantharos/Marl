<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import {
		createOrg,
		createProject,
		getMe,
		listProjects,
		type ProjectSummary,
		type TenantSummary
	} from '$lib/api';
	import {
		currentDevUser,
		devAuthEnabled,
		hasStyToken,
		hydrateSession,
		sessionStore,
		signOut,
		startDevLogin
	} from '$lib/session';
	import TopNav from '$lib/components/TopNav.svelte';

	let { children } = $props();

	let status = $state<'loading' | 'signedOut' | 'signedIn'>('loading');
	let user = $state('');
	let tenants = $state<TenantSummary[]>([]);
	let projects = $state<ProjectSummary[]>([]);
	let projectName = $state('');
	let orgName = $state('');
	let devUser = $state('dev');
	let message = $state('');
	let busy = $state(false);

	onMount(() => {
		const unsubscribe = sessionStore.subscribe((state) => {
			status = hasStyToken() ? 'signedIn' : state.status;
		});
		hydrateSession().then(loadData).catch(() => { status = 'signedOut'; });
		return unsubscribe;
	});

	async function loadData() {
		if (!hasStyToken()) {
			status = 'signedOut';
			return;
		}
		try {
			const me = await getMe();
			user = me.user;
			tenants = me.tenants;
			projects = await listProjects();
			status = 'signedIn';
		} catch {
			status = 'signedOut';
		}
	}

	async function handleCreateProject() {
		if (!projectName.trim()) return;
		const tenant = tenants[0]?.name ?? user;
		busy = true;
		message = '';
		try {
			await createProject(`${tenant}/${projectName.trim()}`);
			projectName = '';
			projects = await listProjects();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleCreateOrg() {
		if (!orgName.trim()) return;
		busy = true;
		message = '';
		try {
			await createOrg(orgName.trim());
			orgName = '';
			const me = await getMe();
			tenants = me.tenants;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleDevLogin() {
		busy = true;
		message = '';
		try {
			await startDevLogin(devUser.trim() || 'dev');
			await loadData();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleSignOut() {
		await signOut();
		status = 'signedOut';
		projects = [];
		user = '';
	}
</script>

<svelte:head>
	<title>sty</title>
</svelte:head>

{#if status === 'signedOut'}
	<main class="grid min-h-screen place-items-center bg-[#0f0f0d] px-6">
		<div class="w-full max-w-sm">
			<h1 class="text-5xl font-bold tracking-tight text-[#f0eee4]">sty</h1>
			<p class="mt-3 text-sm leading-6 text-[#8c887e]">
				Hosted PIG projects with workspaces, snapshots, code browsing, and sync.
			</p>
			<div class="mt-6">
				<button class="w-full rounded bg-[#eae9e4] px-4 py-2.5 text-sm font-medium text-[#0f0f0d]" onclick={() => import('$lib/session').then((m) => m.startLogin())}>
					Sign in with Ave
				</button>
			</div>
			{#if devAuthEnabled()}
				<div class="mt-4 rounded border border-[#2a2a28] p-3">
					<div class="flex gap-2">
						<input class="min-w-0 flex-1 rounded bg-[#1a1a18] px-2 py-1.5 text-sm text-[#eae9e4] outline-none" placeholder={currentDevUser() || 'dev'} bind:value={devUser} />
						<button class="rounded bg-[#2e2e2c] px-3 py-1.5 text-xs font-medium text-[#eae9e4]" disabled={busy} onclick={handleDevLogin}>
							Dev sign in
						</button>
					</div>
				</div>
			{/if}
			{#if message}<p class="mt-3 text-sm text-[#d96c5a]">{message}</p>{/if}
		</div>
	</main>
{:else if status === 'signedIn'}
	<div class="flex h-screen flex-col overflow-hidden bg-[#0f0f0d]">
		<TopNav
			{user}
			{tenants}
			{projects}
			onSignOut={handleSignOut}
			onCreateProject={handleCreateProject}
			onCreateOrg={handleCreateOrg}
			onDevLogin={handleDevLogin}
			{projectName}
			{orgName}
			{busy}
			{message}
			devAuthEnabled={devAuthEnabled()}
			currentDevUser={currentDevUser()}
			{devUser}
		/>
		<div class="flex-1 overflow-y-auto">
			{@render children()}
		</div>
	</div>
{:else}
	<div class="grid min-h-screen place-items-center bg-[#0f0f0d]">
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	</div>
{/if}
