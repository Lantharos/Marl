<script lang="ts">
	import { isAbortError, listNotifications, markNotificationRead, type NotificationItem } from '$lib/api';
	import Spinner from '$lib/components/Spinner.svelte';

	let loading = $state(true);
	let busyId = $state('');
	let error = $state('');
	let notifications = $state<NotificationItem[]>([]);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const response = await listNotifications({ signal, perPage: 100 });
			notifications = response.items;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load notifications';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function markRead(item: NotificationItem) {
		busyId = item.id;
		try {
			await markNotificationRead(item.id);
			notifications = notifications.map((candidate) =>
				candidate.id === item.id ? { ...candidate, read_at: new Date().toISOString() } : candidate
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update notification';
		} finally {
			busyId = '';
		}
	}

	function timeLabel(value: string) {
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}

	$effect(() => {
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});
</script>

<div class="mx-auto max-w-4xl px-8 py-10">
	<div class="mb-5 grid gap-1">
		<h2 class="text-base font-semibold text-[#f0eee4]">Notifications</h2>
		<p class="text-sm text-[#6f6b5f]">Review, ready, and merge activity that needs your attention.</p>
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if notifications.length === 0}
		<div class="border border-[#2a2a28] bg-[#141412] p-8 text-center text-sm text-[#8c887e]">
			No notifications.
		</div>
	{:else}
		<div class="divide-y divide-[#252522] border border-[#2a2a28] bg-[#141412]">
			{#each notifications as item (item.id)}
				<div class="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
					<a class="min-w-0" href={item.href}>
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="text-sm font-medium {item.read_at ? 'text-[#a09d94]' : 'text-[#eae9e4]'}">{item.title}</span>
							<span class="text-xs text-[#6f6b5f]">{item.tenant}/{item.project}</span>
						</div>
						<div class="mt-1 text-sm text-[#8c887e]">{item.body}</div>
						<div class="mt-1 text-xs text-[#6f6b5f]">{timeLabel(item.created_at)}</div>
					</a>
					{#if !item.read_at}
						<button
							class="h-8 border border-[#2a2a28] px-3 text-xs font-medium text-[#eae9e4] hover:bg-[#1e1e1c] disabled:opacity-50"
							disabled={busyId === item.id}
							onclick={() => markRead(item)}
						>
							Mark read
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
