<script lang="ts">
	import type { Comment } from '$lib/api';

	let {
		comments,
		onSubmit
	}: {
		comments: Comment[];
		onSubmit: (body: string) => void;
	} = $props();

	let body = $state('');
	let busy = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!body.trim()) return;
		busy = true;
		try {
			onSubmit(body.trim());
			body = '';
		} finally {
			busy = false;
		}
	}
</script>

<div class="grid gap-4">
	{#each comments as comment}
		<div class="rounded border border-[#2a2a28]">
			<div class="flex items-center gap-2 rounded-t bg-[#1a1a18] px-3 py-2">
				<span class="text-sm font-medium text-[#eae9e4]">{comment.author}</span>
				<span class="text-xs text-[#6f6b5f]">{new Date(comment.created_at).toLocaleString()}</span>
			</div>
			<div class="px-3 py-3 text-sm text-[#eae9e4] leading-relaxed whitespace-pre-wrap">{comment.body}</div>
		</div>
	{/each}

	<form onsubmit={handleSubmit} class="grid gap-2">
		<textarea
			class="min-h-[80px] resize-y rounded border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none focus:border-[#3a3a36]"
			placeholder="Write a comment..."
			bind:value={body}
		></textarea>
		<div class="flex justify-end">
			<button
				type="submit"
				class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50"
				disabled={busy || !body.trim()}
			>
				Comment
			</button>
		</div>
	</form>
</div>
