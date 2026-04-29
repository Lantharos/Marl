<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		createOrg,
		getInitializedMe,
		listProjects,
		type ProjectSummary,
		type TenantSummary
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import {
		clearStyToken,
		hydrateSession,
		signOut,
		type AveProfile
	} from '$lib/session';
	import TopNav from '$lib/components/TopNav.svelte';
	import Spinner from '$lib/components/Spinner.svelte';

	let { children } = $props();

	let status = $state<'loading' | 'signedOut' | 'signedIn'>('loading');
	let profile = $state<AveProfile | null>(null);
	let tenants = $state<TenantSummary[]>([]);
	let projects = $state<ProjectSummary[]>([]);
	let message = $state('');
	let busy = $state(false);
	let loadDataPromise: Promise<void> | null = null;
	let bootstrapDone = false;
	const isAuthRoute = $derived($page.url.pathname.startsWith('/auth/'));
	const isStandaloneRoute = $derived(isAuthRoute || $page.url.pathname.startsWith('/verify/'));

	$effect(() => {
		if (isStandaloneRoute) {
			bootstrapDone = false;
			return;
		}
		if (!bootstrapDone && !loadDataPromise) {
			void loadData();
		}
	});

	async function loadData() {
		if (loadDataPromise) return loadDataPromise;
		loadDataPromise = loadInitializedData().finally(() => {
			loadDataPromise = null;
		});
		return loadDataPromise;
	}

	async function loadInitializedData() {
		status = 'loading';
		try {
			await hydrateSession();
			const me = await getInitializedMe();
			if (me.profile) {
				profile = {
					sub: me.profile.user,
					name: me.profile.display_name,
					preferredUsername: me.profile.handle ?? undefined,
					email: me.profile.email ?? undefined,
					picture: me.profile.avatar_url ?? undefined
				};
			} else {
				profile = null;
			}
			tenants = me.tenants;
			projects = await listProjects();
			appData.set({ me, projects, ready: true });
			status = 'signedIn';
		} catch {
			clearStyToken();
			appData.set({ me: null, projects: [], ready: false });
			projects = [];
			tenants = [];
			profile = null;
			status = 'signedOut';
		} finally {
			bootstrapDone = true;
		}
	}

	async function handleCreateOrg(name: string) {
		if (!name.trim()) return;
		busy = true;
		message = '';
		try {
			const tenant = await createOrg(name.trim());
			const me = await getInitializedMe();
			tenants = me.tenants;
			appData.set({ me, projects, ready: true });
			await goto(`/${tenant.name}`);
		} catch (error) {
			message = error instanceof Error ? error.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleSignOut() {
		await signOut();
		bootstrapDone = false;
		status = 'signedOut';
		projects = [];
		tenants = [];
		profile = null;
		appData.set({ me: null, projects: [], ready: false });
	}
</script>

<svelte:head>
	<title>sty</title>
</svelte:head>

{#if isStandaloneRoute}
	{@render children()}
{:else if status === 'signedOut'}
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
					<button class="rounded bg-[#eae9e4] px-6 py-2.5 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]" onclick={() => import('$lib/session').then((m) => m.startLogin())}>
						Sign in
					</button>
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
					<pre class="mt-4 overflow-x-auto text-sm leading-relaxed text-[#a09d94]"><code><span class="text-[#6f6b5f]"># sign in to sty</span>
<span class="text-[#eae9e4]">$ sty login</span>

<span class="text-[#6f6b5f]"># connect this repo</span>
<span class="text-[#eae9e4]">$ sty init tenant/project</span>

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
			{profile}
			{tenants}
			{projects}
			onSignOut={handleSignOut}
			onCreateOrg={handleCreateOrg}
			{busy}
			{message}
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
