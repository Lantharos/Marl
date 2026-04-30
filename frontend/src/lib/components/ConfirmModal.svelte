<script lang="ts">
	let {
		title,
		body,
		confirmLabel,
		cancelLabel = 'Cancel',
		destructive = false,
		busy = false,
		onConfirm,
		onCancel
	}: {
		title: string;
		body: string;
		confirmLabel: string;
		cancelLabel?: string;
		destructive?: boolean;
		busy?: boolean;
		onConfirm: () => void | Promise<void>;
		onCancel: () => void;
	} = $props();
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
	<div class="w-full max-w-sm rounded border border-[#2a2a28] bg-[#141412] p-5 shadow-lg">
		<h3 class="text-sm font-semibold text-[#f0eee4]">{title}</h3>
		<p class="mt-2 text-sm leading-5 text-[#a09d94]">{body}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button class="rounded px-3 py-1.5 text-xs font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" disabled={busy} onclick={onCancel}>
				{cancelLabel}
			</button>
			<button
				class="rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50 {destructive ? 'border-[#d96c5a] text-[#d96c5a] hover:bg-[#d96c5a] hover:text-[#0f0f0d]' : 'border-[#2a2a28] text-[#eae9e4] hover:bg-[#1e1e1c]'}"
				disabled={busy}
				onclick={onConfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</div>
