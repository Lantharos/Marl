<script lang="ts">
	import type { ProtocolItem } from '$lib/api';

	let {
		hooks,
		webhooks,
		busy,
		hookEvent = $bindable(),
		hookUrl = $bindable(),
		webhookEvent = $bindable(),
		webhookUrl = $bindable(),
		addHook,
		removeProtocolItem
	}: {
		hooks: ProtocolItem[];
		webhooks: ProtocolItem[];
		busy: boolean;
		hookEvent: string;
		hookUrl: string;
		webhookEvent: string;
		webhookUrl: string;
		addHook: (kind: 'hook' | 'webhook') => void;
		removeProtocolItem: (kind: string, id: string) => void;
	} = $props();

	function title(item: ProtocolItem) {
		return String(item.name ?? item.title ?? item.event ?? item.id);
	}

	function detail(item: ProtocolItem) {
		return String(item.url ?? item.description ?? '');
	}
</script>

<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
	<div class="text-sm font-medium text-[#eae9e4]">Automation</div>
	<div class="mt-3 grid gap-4 md:grid-cols-2">
		<div>
			<div class="mb-2 text-xs text-[#8c887e]">Hooks</div>
			<div class="grid gap-1">
				{#each hooks as item}
					<div class="flex items-start justify-between gap-2 rounded bg-[#0f0f0d] px-3 py-2">
						<div class="min-w-0">
							<div class="truncate text-xs font-medium text-[#eae9e4]">{title(item)}</div>
							<div class="truncate text-[11px] text-[#6f6b5f]">{detail(item)}</div>
						</div>
						<button class="text-[11px] text-[#8c887e] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeProtocolItem('hook', item.id)}>Delete</button>
					</div>
				{:else}
					<p class="text-xs text-[#6f6b5f]">No hooks.</p>
				{/each}
			</div>
			<div class="mt-2 grid gap-2">
				<input class="rounded bg-[#0f0f0d] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" bind:value={hookEvent} />
				<input class="rounded bg-[#0f0f0d] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" placeholder="https://..." bind:value={hookUrl} />
				<button class="w-fit rounded bg-[#2a2a28] px-2.5 py-1 text-xs text-[#eae9e4]" disabled={busy || !hookUrl.trim()} onclick={() => addHook('hook')}>Add hook</button>
			</div>
		</div>
		<div>
			<div class="mb-2 text-xs text-[#8c887e]">Webhooks</div>
			<div class="grid gap-1">
				{#each webhooks as item}
					<div class="flex items-start justify-between gap-2 rounded bg-[#0f0f0d] px-3 py-2">
						<div class="min-w-0">
							<div class="truncate text-xs font-medium text-[#eae9e4]">{title(item)}</div>
							<div class="truncate text-[11px] text-[#6f6b5f]">{detail(item)}</div>
						</div>
						<button class="text-[11px] text-[#8c887e] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeProtocolItem('webhook', item.id)}>Delete</button>
					</div>
				{:else}
					<p class="text-xs text-[#6f6b5f]">No webhooks.</p>
				{/each}
			</div>
			<div class="mt-2 grid gap-2">
				<input class="rounded bg-[#0f0f0d] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" bind:value={webhookEvent} />
				<input class="rounded bg-[#0f0f0d] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" placeholder="https://..." bind:value={webhookUrl} />
				<button class="w-fit rounded bg-[#2a2a28] px-2.5 py-1 text-xs text-[#eae9e4]" disabled={busy || !webhookUrl.trim()} onclick={() => addHook('webhook')}>Add webhook</button>
			</div>
		</div>
	</div>
</div>
