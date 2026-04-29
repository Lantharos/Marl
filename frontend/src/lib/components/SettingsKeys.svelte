<script lang="ts">
	import type { AccountKey } from '$lib/api';

	let {
		signingKeys,
		busy,
		signingKeyName = $bindable(),
		signingKeyBody = $bindable(),
		addSigningKey,
		removeKey
	}: {
		signingKeys: AccountKey[];
		busy: boolean;
		signingKeyName: string;
		signingKeyBody: string;
		addSigningKey: () => void;
		removeKey: (kind: 'signing_key', id: string) => void;
	} = $props();

	function shortKey(value: string) {
		return value.length > 20 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
	}
</script>

<div class="rounded border border-[#2a2a28] bg-[#141412]">
	<div class="border-b border-[#252522] px-4 py-3">
		<div class="text-sm font-medium text-[#eae9e4]">Signing keys</div>
	</div>
	<div class="grid gap-1 p-3">
		{#each signingKeys as item}
			<div class="flex items-start justify-between gap-3 rounded bg-[#0f0f0d] px-3 py-2.5">
				<div class="min-w-0">
					<div class="truncate text-sm font-medium text-[#eae9e4]">{item.name}</div>
					<div class="mt-1 truncate text-xs text-[#6f6b5f]">
						{item.algorithm} - {shortKey(item.fingerprint)}
					</div>
				</div>
				<button
					class="rounded px-2 py-1 text-xs text-[#8c887e] hover:bg-[#1b1b18] hover:text-[#d96c5a] disabled:opacity-50"
					disabled={busy}
					onclick={() => removeKey('signing_key', item.id)}
				>
					Delete
				</button>
			</div>
		{:else}
			<div class="px-3 py-8 text-center text-sm text-[#8c887e]">No signing keys yet.</div>
		{/each}
	</div>
	<div class="border-t border-[#252522] p-4">
		<div class="grid gap-2">
			<input
				class="rounded border border-transparent bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a35]"
				placeholder="Key name"
				bind:value={signingKeyName}
			/>
			<textarea
				class="min-h-24 resize-y rounded border border-transparent bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a35]"
				placeholder="Ed25519 public key"
				bind:value={signingKeyBody}
			></textarea>
			<button
				class="w-fit rounded bg-[#eae9e4] px-4 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-50"
				disabled={busy || !signingKeyName.trim() || !signingKeyBody.trim()}
				onclick={addSigningKey}
			>
				Add signing key
			</button>
		</div>
	</div>
</div>
