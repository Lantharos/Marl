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
	import Spinner from '$lib/components/Spinner.svelte';

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
	<main class="min-h-screen bg-[#0f0f0d]">
		<!-- Hero -->
		<section class="px-6 pt-20 pb-16 md:px-12 lg:px-20">
			<div class="mx-auto max-w-4xl text-center">
				<h1 class="text-6xl font-bold tracking-tight text-[#f0eee4] md:text-7xl">sty</h1>
				<p class="mt-4 text-xl text-[#d9a66c] md:text-2xl">where pigs ship code</p>
				<p class="mt-4 text-sm leading-6 text-[#8c887e] md:text-base">
					Version control for humans who think in workspaces, not branches.<br class="hidden md:block" />
					Save, cram, and ship your code with confidence.
				</p>
				<div class="mt-8 flex justify-center gap-3">
					{#if devAuthEnabled()}
						<div class="flex gap-2">
							<input class="rounded bg-[#1a1a18] px-3 py-2 text-sm text-[#eae9e4] outline-none focus:border-[#d9a66c] border border-[#2a2a28]" placeholder={currentDevUser() || 'dev'} bind:value={devUser} />
							<button class="rounded bg-[#eae9e4] px-4 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]" disabled={busy} onclick={handleDevLogin}>
								Dev sign in
							</button>
						</div>
					{:else}
						<button class="rounded bg-[#eae9e4] px-6 py-2.5 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]" onclick={() => import('$lib/session').then((m) => m.startLogin())}>
							Sign in with Ave
						</button>
					{/if}
				</div>
				{#if message}<p class="mt-3 text-sm text-[#d96c5a]">{message}</p>{/if}
			</div>
		</section>

		<!-- Code snippet -->
		<section class="px-6 pb-16 md:px-12 lg:px-20">
			<div class="mx-auto max-w-2xl">
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
					<div class="flex items-center gap-2 border-b border-[#2a2a28] pb-3">
						<span class="h-3 w-3 rounded-full bg-[#d96c5a]"></span>
						<span class="h-3 w-3 rounded-full bg-[#d9a66c]"></span>
						<span class="h-3 w-3 rounded-full bg-[#7cb97c]"></span>
						<span class="ml-2 text-xs text-[#6f6b5f]">terminal</span>
					</div>
					<pre class="mt-4 overflow-x-auto text-sm leading-relaxed text-[#a09d94]"><code><span class="text-[#6f6b5f]"># initialize a project</span>
<span class="text-[#eae9e4]">$ pig init my-org/my-project</span>

<span class="text-[#6f6b5f]"># create a workspace</span>
<span class="text-[#eae9e4]">$ pig work new feature-x</span>

<span class="text-[#6f6b5f]"># save your progress</span>
<span class="text-[#eae9e4]">$ pig save "add user auth"</span>

<span class="text-[#6f6b5f]"># squash unsaved work</span>
<span class="text-[#eae9e4]">$ pig cram "polish auth flow"</span>

<span class="text-[#6f6b5f]"># sync to sty</span>
<span class="text-[#eae9e4]">$ pig sync</span>

<span class="text-[#6f6b5f]"># ship when ready</span>
<span class="text-[#eae9e4]">$ pig ship</span></code></pre>
				</div>
			</div>
		</section>

		<!-- Features -->
		<section class="px-6 pb-20 md:px-12 lg:px-20">
			<div class="mx-auto max-w-4xl">
				<h2 class="text-center text-sm font-semibold uppercase tracking-wide text-[#6f6b5f]">Features</h2>
				<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
						<div class="text-lg font-semibold text-[#eae9e4]">Workspaces</div>
						<p class="mt-2 text-sm text-[#8c887e]">Branch-less version control. Create workspaces from any parent, not just main.</p>
					</div>
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
						<div class="text-lg font-semibold text-[#eae9e4]">Saves & Crams</div>
						<p class="mt-2 text-sm text-[#8c887e]">Lightweight checkpoints you can squash. No more WIP commits.</p>
					</div>
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
						<div class="text-lg font-semibold text-[#eae9e4]">Ready to Ship</div>
						<p class="mt-2 text-sm text-[#8c887e]">Mark workspaces as ready, review diffs, and merge with confidence.</p>
					</div>
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
						<div class="text-lg font-semibold text-[#eae9e4]">Code Browser</div>
						<p class="mt-2 text-sm text-[#8c887e]">Browse any workspace's files with syntax highlighting right in the browser.</p>
					</div>
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
						<div class="text-lg font-semibold text-[#eae9e4]">History</div>
						<p class="mt-2 text-sm text-[#8c887e]">Full history with diffs for every save, cram, and ship. See exactly what changed.</p>
					</div>
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
						<div class="text-lg font-semibold text-[#eae9e4]">Issues</div>
						<p class="mt-2 text-sm text-[#8c887e]">Track bugs and features alongside your code. Comment and close when done.</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Footer -->
		<footer class="border-t border-[#2a2a28] px-6 py-8 md:px-12 lg:px-20">
			<div class="mx-auto max-w-4xl text-center text-xs text-[#6f6b5f]">
				sty — where pigs ship code
			</div>
		</footer>
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
		<Spinner />
	</div>
{/if}
