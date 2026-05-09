<script lang="ts">
	import CircleDot from 'lucide-svelte/icons/circle-dot';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import X from 'lucide-svelte/icons/x';

	type ReviewAction = 'comment' | 'approve' | 'request_changes';

	let {
		count,
		canMaintain,
		onCancel,
		onSubmit
	}: {
		count: number;
		canMaintain: boolean;
		onCancel: () => void;
		onSubmit: (body: string, action: ReviewAction) => Promise<void> | void;
	} = $props();

	let body = $state('');
	let action = $state<ReviewAction>('comment');
	let busy = $state(false);
	const submitLabel = $derived(count > 0 ? `Submit ${count} ${count === 1 ? 'comment' : 'comments'}` : 'Submit comment');

	async function submit() {
		if (busy || (!body.trim() && count === 0)) return;
		busy = true;
		try {
			await onSubmit(body.trim(), action);
		} finally {
			busy = false;
		}
	}
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4">
	<section class="w-full max-w-2xl border border-[#3a3a36] bg-[#10100e] shadow-2xl">
		<div class="flex items-center justify-between border-b border-[#2a2a28] px-4 py-3">
			<div class="font-medium text-[#eae9e4]">Finish your comments</div>
			<button class="text-[#8c887e] hover:text-[#eae9e4]" aria-label="Close" onclick={onCancel}><X class="h-4 w-4" /></button>
		</div>
		<div class="p-4">
			<textarea class="min-h-[150px] w-full resize-y bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline outline-1 outline-[#2a2a28] placeholder:text-[#6f6b5f] focus:outline-[#d9a66c]" placeholder="Leave a comment" bind:value={body}></textarea>
			<div class="mt-4 grid gap-3 text-sm">
				<button class="flex items-start gap-3 text-left {action === 'comment' ? 'text-[#eae9e4]' : 'text-[#8c887e]'}" onclick={() => (action = 'comment')}>
					<CircleDot class="mt-0.5 h-4 w-4 {action === 'comment' ? 'text-[#d9a66c]' : 'text-[#4a4942]'}" />
					<span><span class="block font-medium">Comment</span><span class="block text-xs text-[#8c887e]">Submit general feedback without explicit approval.</span></span>
				</button>
				{#if canMaintain}
					<button class="flex items-start gap-3 text-left {action === 'approve' ? 'text-[#eae9e4]' : 'text-[#8c887e]'}" onclick={() => (action = 'approve')}>
						<CircleDot class="mt-0.5 h-4 w-4 {action === 'approve' ? 'text-[#7cb97c]' : 'text-[#4a4942]'}" />
						<span><span class="block font-medium">Approve</span><span class="block text-xs text-[#8c887e]">Submit feedback and approve merging these changes.</span></span>
					</button>
					<button class="flex items-start gap-3 text-left {action === 'request_changes' ? 'text-[#eae9e4]' : 'text-[#8c887e]'}" onclick={() => (action = 'request_changes')}>
						<CircleDot class="mt-0.5 h-4 w-4 {action === 'request_changes' ? 'text-[#d9a66c]' : 'text-[#4a4942]'}" />
						<span><span class="block font-medium">Request changes</span><span class="block text-xs text-[#8c887e]">Submit feedback suggesting changes.</span></span>
					</button>
				{/if}
			</div>
		</div>
		<div class="flex items-center justify-between border-t border-[#2a2a28] px-4 py-3">
			<div class="flex items-center gap-2 text-xs text-[#8c887e]"><MessageSquare class="h-3.5 w-3.5" />{count} pending {count === 1 ? 'comment' : 'comments'}</div>
			<div class="flex gap-2">
				<button class="bg-[#242420] px-3 py-1.5 text-sm text-[#d8d5ca] hover:bg-[#2f2f2b]" onclick={onCancel}>Cancel</button>
				<button class="bg-[#2d7d3a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#348f43] disabled:opacity-50" disabled={busy || (!body.trim() && count === 0)} onclick={submit}>{busy ? 'Submitting...' : submitLabel}</button>
			</div>
		</div>
	</section>
</div>
