<script lang="ts">
	import { onMount } from 'svelte';
	import { approveRemoteApproval, getRemoteApproval, type RemoteApproval } from '$lib/api';
	import Spinner from '$lib/components/Spinner.svelte';

	let { params } = $props();
	let approval = $state<RemoteApproval | null>(null);
	let loading = $state(true);
	let busy = $state(false);
	let error = $state('');

	onMount(() => {
		load();
	});

	async function load() {
		loading = true;
		error = '';
		try {
			approval = await getRemoteApproval(params.approval);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load approval.';
		} finally {
			loading = false;
		}
	}

	async function approve() {
		busy = true;
		error = '';
		try {
			approval = await approveRemoteApproval(params.approval);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not approve action.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Approve action - sty</title>
</svelte:head>

<main class="min-h-screen bg-[#0f0f0d] px-6 py-10 text-[#eae9e4]">
	<div class="mx-auto max-w-2xl border-b border-[#252522] pb-5">
		<a href="/" class="text-lg font-semibold text-[#f0eee4]">sty</a>
	</div>

	<div class="mx-auto mt-12 max-w-2xl">
	{#if loading}
		<div class="flex min-h-[320px] items-center justify-center">
			<Spinner />
		</div>
	{:else if error}
		<div class="rounded border border-[#3a2824] bg-[#16110f] px-4 py-3 text-sm text-[#d96c5a]">
			{error}
		</div>
	{:else if approval}
		<div class="space-y-6">
			<div>
				<h1 class="text-2xl font-semibold text-[#f0eee4]">Approve action</h1>
				<p class="mt-1 text-sm text-[#8c887e]">Confirm this from your signed-in browser session.</p>
			</div>
			<div class="rounded border border-[#2a2a28] bg-[#141412]">
				<div class="border-b border-[#252522] px-4 py-3">
					<div class="text-sm font-medium text-[#eae9e4]">{approval.summary}</div>
					<div class="mt-1 font-mono text-xs text-[#6f6b5f]">{approval.action}</div>
				</div>
				<div class="flex items-center justify-between px-4 py-3 text-sm">
					<span class="text-[#8c887e]">Status</span>
					<span class={approval.status === 'approved' ? 'text-[#8ccf7e]' : 'text-[#eae9e4]'}>
						{approval.status}
					</span>
				</div>
				<div class="flex items-center justify-between border-t border-[#252522] px-4 py-3 text-sm">
					<span class="text-[#8c887e]">Expires</span>
					<span class="text-[#eae9e4]">{new Date(approval.expires_at).toLocaleString()}</span>
				</div>
			</div>
			{#if approval.status === 'pending'}
				<button
					type="button"
					class="rounded bg-[#eae9e4] px-5 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-60"
					disabled={busy}
					onclick={approve}
				>
					{busy ? 'Approving...' : 'Approve'}
				</button>
			{:else}
				<div class="text-sm text-[#8c887e]">You can return to the terminal.</div>
			{/if}
		</div>
	{/if}
	</div>
</main>
