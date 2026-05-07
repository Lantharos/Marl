<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		createAccountTenant,
		createOrg,
		getMe,
		listProjects,
		type ProjectSummary,
		type TenantSummary
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import {
		clearStyToken,
		hydrateSession,
		signOut,
		startLogin,
		type AveProfile
	} from '$lib/session';
	import TopNav from '$lib/components/TopNav.svelte';
	import Spinner from '$lib/components/Spinner.svelte';

	let { children } = $props();

	let status = $state<'loading' | 'signedOut' | 'setup' | 'signedIn'>('loading');
	let profile = $state<AveProfile | null>(null);
	let tenants = $state<TenantSummary[]>([]);
	let projects = $state<ProjectSummary[]>([]);
	let message = $state('');
	let busy = $state(false);
	let setupName = $state('');
	let setupSuggestions = $state<string[]>([]);
	let aveHandle = $state('');
	let loadDataPromise: Promise<void> | null = null;
	let bootstrapDone = false;
	const isAuthRoute = $derived($page.url.pathname.startsWith('/auth/'));
	const isDocsRoute = $derived($page.url.pathname === '/docs' || $page.url.pathname.startsWith('/docs/'));
	const isPigRoute = $derived($page.url.pathname === '/pig' || $page.url.pathname.startsWith('/pig/'));
	const isLegalRoute = $derived($page.url.pathname === '/privacy' || $page.url.pathname === '/terms');
	const isStandaloneRoute = $derived(isAuthRoute || $page.url.pathname.startsWith('/verify/') || $page.url.pathname.startsWith('/oauth/') || isDocsRoute || isPigRoute || isLegalRoute);
	const isErrorPage = $derived($page.status >= 400);
	const pathParts = $derived($page.url.pathname.split('/').filter(Boolean));
	const reservedRoot = $derived(['auth', 'settings', 'verify', 'oauth', 'docs', 'pig', 'privacy', 'terms', 'u'].includes(pathParts[0] ?? ''));
	const projectSection = $derived(pathParts[2] ?? '');
	const isPublicProjectSection = $derived(!['settings', 'automation', 'protocol'].includes(projectSection));
	const isLandingPage = $derived($page.url.pathname === '/');
	const isProjectRoute = $derived(pathParts.length >= 2 && !reservedRoot);
	const isPublicRoute = $derived(
		isLandingPage ||
			(pathParts.length === 1 && !reservedRoot) ||
			(pathParts.length >= 2 && !reservedRoot && isPublicProjectSection)
	);
	const hasPublicShell = $derived(isPublicRoute && !isLandingPage && !isProjectRoute);

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
			const me = await getMe();
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
			if (me.account_setup_required) {
				aveHandle = me.profile?.handle ?? '';
				setupSuggestions = me.account_tenant_suggestions ?? [];
				setupName = setupSuggestions[0] ?? `${aveHandle}-dev`;
				tenants = me.tenants;
				projects = [];
				appData.set({ me, projects: [], ready: false });
				status = 'setup';
				return;
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
			const me = await getMe();
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

	async function handleCreateAccountTenant() {
		if (!setupName.trim()) return;
		busy = true;
		message = '';
		try {
			const tenant = await createAccountTenant(setupName.trim());
			bootstrapDone = false;
			await loadData();
			await goto(`/${tenant.name}`, { replaceState: true });
		} catch (error) {
			message = error instanceof Error ? error.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>sty</title>
</svelte:head>

{#if isStandaloneRoute || isErrorPage}
	{@render children()}
{:else if status !== 'signedIn' && isLandingPage}
	{@render children()}
{:else if status !== 'signedIn' && isProjectRoute && isPublicRoute}
	{@render children()}
{:else if status !== 'signedIn' && hasPublicShell}
	<div class="min-h-screen bg-[#0f0f0d]">
		<header class="border-b border-[#2a2a28] bg-[#0f0f0d]">
			<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-2.5">
				<a href="/" class="text-lg font-bold tracking-tight text-[#f0eee4]">sty</a>
				<button class="rounded border border-[#2a2a28] px-3 py-1.5 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={startLogin}>
					Sign in
				</button>
			</div>
		</header>
		{@render children()}
	</div>
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
<span class="text-[#eae9e4]">$ sty init</span>

<span class="text-[#6f6b5f]"># create a workspace</span>
<span class="text-[#eae9e4]">$ pig work new feature-x</span>

<span class="text-[#6f6b5f]"># save your progress</span>
<span class="text-[#eae9e4]">$ pig save "add user auth"</span>

<span class="text-[#6f6b5f]"># squash unsaved work</span>
<span class="text-[#eae9e4]">$ pig cram "polish auth flow"</span>

<span class="text-[#6f6b5f]"># sync to sty</span>
<span class="text-[#eae9e4]">$ pig sync</span>

<span class="text-[#6f6b5f]"># mark work ready</span>
<span class="text-[#eae9e4]">$ pig work ready</span></code></pre>
				</div>
			</div>
		</section>

		<!-- Features -->
		<section class="px-6 pb-20 md:px-12 lg:px-20">
			<div class="mx-auto max-w-4xl">
				<h2 class="text-center text-lg font-semibold text-[#eae9e4]">What sty gives you</h2>
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
				sty - where pigs ship code
			</div>
		</footer>
	</main>
{:else if status === 'setup'}
	<main class="grid min-h-screen place-items-center bg-[#0f0f0d] px-6">
		<section class="w-full max-w-md bg-[#141412] p-5">
			<h1 class="text-lg font-semibold text-[#f0eee4]">Choose your sty username</h1>
			<p class="mt-3 text-sm leading-6 text-[#8c887e]">
				Your Ave handle is @{aveHandle}, but /{aveHandle} is already taken on sty.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				{#each setupSuggestions as suggestion}
					<button class="bg-[#1e1e1c] px-2.5 py-1 text-sm {setupName === suggestion ? 'text-[#d9a66c]' : 'text-[#a09d94] hover:text-[#eae9e4]'}" onclick={() => (setupName = suggestion)}>
						/{suggestion}
					</button>
				{/each}
			</div>
			<div class="mt-4 flex gap-2">
				<input class="h-9 min-w-0 flex-1 bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none" bind:value={setupName} placeholder="username" />
				<button class="bg-[#eae9e4] px-3 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !setupName.trim()} onclick={handleCreateAccountTenant}>
					Continue
				</button>
			</div>
			{#if message}
				<p class="mt-3 text-sm text-[#d96c5a]">{message}</p>
			{/if}
			<button class="mt-4 text-sm text-[#8c887e] hover:text-[#eae9e4]" onclick={handleSignOut}>Sign out</button>
		</section>
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
