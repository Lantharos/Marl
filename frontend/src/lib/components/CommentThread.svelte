<script lang="ts">
	import type { Comment } from '$lib/api';
	import { userName } from '$lib/identity';
	import ContentComposer from './ContentComposer.svelte';
	import Markdown from './Markdown.svelte';

	let {
		comments,
		onSubmit,
		readonly = false
	}: {
		comments: Comment[];
		onSubmit: (body: string) => void;
		readonly?: boolean;
	} = $props();

	let body = $state('');
	let busy = $state(false);

	async function handleSubmit() {
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
				<span class="text-sm font-medium text-[#eae9e4]">{userName(comment.author, comment.author_profile)}</span>
				<span class="text-xs text-[#6f6b5f]">{new Date(comment.created_at).toLocaleString()}</span>
			</div>
			<div class="px-3 py-3 text-sm text-[#eae9e4] leading-relaxed">
				<Markdown source={comment.body} />
			</div>
		</div>
	{/each}

	{#if !readonly}
		<ContentComposer value={body} placeholder="Write a comment..." minHeight="90px" {busy} onInput={(value) => (body = value)} onSubmit={handleSubmit} />
	{/if}
</div>
