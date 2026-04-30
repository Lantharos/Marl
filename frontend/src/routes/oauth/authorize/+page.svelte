<script lang="ts">
	import { page } from '$app/stores';
	import { authorizeOAuthApp, getInitializedMe, getOAuthApp, isAbortError, type DeveloperApp } from '$lib/api';
	import Spinner from '$lib/components/Spinner.svelte';
	import { startLogin } from '$lib/session';

	const clientId = $derived($page.url.searchParams.get('client_id') ?? '');
	const redirectUri = $derived($page.url.searchParams.get('redirect_uri') ?? '');
	const tenant = $derived($page.url.searchParams.get('tenant') ?? '');
	const project = $derived($page.url.searchParams.get('project') ?? '');
	const scope = $derived($page.url.searchParams.get('scope') ?? 'main:read workspaces:read issues:read releases:read');
	const scopeList = $derived(scope.split(/\s+/).filter(Boolean));
	const oauthState = $derived($page.url.searchParams.get('state'));

	let loading = $state(true);
	let busy = $state(false);
	let signedIn = $state(false);
	let app = $state<DeveloperApp | null>(null);
	let error = $state('');

	$effect(() => {
		if (!clientId) {
			error = 'Missing client_id';
			loading = false;
			return;
		}
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			app = await getOAuthApp(clientId, { signal });
			await getInitializedMe({ signal });
			signedIn = true;
		} catch (e) {
			if (isAbortError(e)) return;
			if (app) {
				signedIn = false;
			} else {
				error = e instanceof Error ? e.message : 'Failed';
			}
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function signIn() {
		localStorage.setItem('sty_post_login', window.location.href);
		await startLogin();
	}

	async function approve() {
		if (!clientId || !redirectUri || !tenant || !project) {
			error = 'Missing OAuth request details';
			return;
		}
		busy = true;
		error = '';
		try {
			const result = await authorizeOAuthApp({
				client_id: clientId,
				redirect_uri: redirectUri,
				tenant,
				project,
				scope,
				state: oauthState
			});
			window.location.href = result.redirect_url;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	function scopeName(value: string) {
		return (
			{
				'main:read': 'Read main',
				'main:write': 'Write main',
				'workspaces:read': 'Read workspaces',
				'workspaces:create': 'Create workspaces',
				'workspaces:write': 'Write workspaces',
				'workspaces:ready': 'Mark ready',
				'workspaces:merge': 'Merge workspaces',
				'issues:read': 'Read issues',
				'issues:write': 'Write issues',
				'releases:read': 'Read releases',
				'releases:write': 'Write releases',
				'webhooks:read': 'Read webhooks',
				'webhooks:write': 'Write webhooks',
				'settings:read': 'Read settings',
				'settings:write': 'Write settings',
				read: 'Read project',
				write: 'Write project'
			}[value] ?? value
		);
	}
</script>

<main class="grid min-h-screen place-items-center bg-[#0f0f0d] px-6">
	{#if loading}
		<Spinner />
	{:else}
		<section class="w-full max-w-lg rounded border border-[#2a2a28] bg-[#141412] p-5">
			<div class="mb-4">
				<a href="/" class="text-lg font-bold text-[#f0eee4]">sty</a>
				<h1 class="mt-6 text-xl font-semibold text-[#f0eee4]">Authorize app</h1>
				<p class="mt-1 text-sm text-[#8c887e]">{app?.name ?? 'This app'} wants access to {tenant}/{project}.</p>
			</div>

			{#if error}
				<p class="mb-4 text-sm text-[#d96c5a]">{error}</p>
			{/if}

			<div class="grid gap-2 rounded bg-[#0f0f0d] p-3 text-sm">
				<div class="flex justify-between gap-3">
					<span class="text-[#8c887e]">App</span>
					<span class="min-w-0 truncate text-[#eae9e4]">{app?.name ?? clientId}</span>
				</div>
				<div class="flex justify-between gap-3">
					<span class="text-[#8c887e]">Project</span>
					<span class="min-w-0 truncate font-mono text-[#eae9e4]">{tenant}/{project}</span>
				</div>
				<div class="flex justify-between gap-3">
					<span class="text-[#8c887e]">Scopes</span>
					<span class="min-w-0 truncate text-right text-[#eae9e4]">{scopeList.map(scopeName).join(', ')}</span>
				</div>
			</div>

			<div class="mt-5 flex justify-end gap-2">
				<a class="px-3 py-1.5 text-sm text-[#8c887e] hover:text-[#eae9e4]" href="/">Cancel</a>
				{#if signedIn}
					<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy} onclick={approve}>
						Authorize
					</button>
				{:else}
					<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d]" onclick={signIn}>
						Sign in
					</button>
				{/if}
			</div>
		</section>
	{/if}
</main>
