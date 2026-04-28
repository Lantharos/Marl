<script lang="ts">
	import type { ProtocolItem } from '$lib/api';

	let {
		signingKeys,
		sshKeys,
		busy,
		sshKeyName = $bindable(),
		sshKeyBody = $bindable(),
		addSshKey,
		removeProtocolItem
	}: {
		signingKeys: ProtocolItem[];
		sshKeys: ProtocolItem[];
		busy: boolean;
		sshKeyName: string;
		sshKeyBody: string;
		addSshKey: () => void;
		removeProtocolItem: (kind: string, id: string) => void;
	} = $props();

	function title(item: ProtocolItem) {
		return String(item.name ?? item.title ?? item.event ?? item.id);
	}

	function detail(item: ProtocolItem) {
		return String(item.url ?? item.description ?? item.key ?? item.algorithm ?? '');
	}
</script>

<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
	<div class="text-sm font-medium text-[#eae9e4]">Keys</div>
	<div class="mt-3 grid gap-4 md:grid-cols-2">
		<div>
			<div class="mb-2 text-xs text-[#8c887e]">Signing keys</div>
			<div class="grid gap-1">
				{#each signingKeys as item}
					<div class="rounded bg-[#0f0f0d] px-3 py-2">
						<div class="truncate text-xs font-medium text-[#eae9e4]">{title(item)}</div>
						<div class="truncate text-[11px] text-[#6f6b5f]">{detail(item)}</div>
					</div>
				{:else}
					<p class="text-xs text-[#6f6b5f]">No signing keys.</p>
				{/each}
			</div>
		</div>
		<div>
			<div class="mb-2 text-xs text-[#8c887e]">SSH keys</div>
			<div class="grid gap-1">
				{#each sshKeys as item}
					<div class="flex items-start justify-between gap-2 rounded bg-[#0f0f0d] px-3 py-2">
						<div class="min-w-0">
							<div class="truncate text-xs font-medium text-[#eae9e4]">{title(item)}</div>
							<div class="truncate text-[11px] text-[#6f6b5f]">{detail(item)}</div>
						</div>
						<button class="text-[11px] text-[#8c887e] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeProtocolItem('ssh_key', item.id)}>Delete</button>
					</div>
				{:else}
					<p class="text-xs text-[#6f6b5f]">No SSH keys.</p>
				{/each}
			</div>
			<div class="mt-2 grid gap-2">
				<input class="rounded bg-[#0f0f0d] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" placeholder="Key name" bind:value={sshKeyName} />
				<textarea class="min-h-20 resize-y rounded bg-[#0f0f0d] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" placeholder="ssh-ed25519 ..." bind:value={sshKeyBody}></textarea>
				<button class="w-fit rounded bg-[#2a2a28] px-2.5 py-1 text-xs text-[#eae9e4]" disabled={busy || !sshKeyName.trim() || !sshKeyBody.trim()} onclick={addSshKey}>Add SSH key</button>
			</div>
		</div>
	</div>
</div>
