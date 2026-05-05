<script lang="ts">
	import type { ReviewComment } from '$lib/api';
	import { userDisplayName, userInitials } from '$lib/identity';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash2 from 'lucide-svelte/icons/trash-2';

	let {
		title,
		comments,
		onSubmit,
		onUpdate = null,
		onDelete = null,
		onCancel = null,
		readonly = false,
		placeholder = 'Leave a review comment...',
		showEmpty = true,
		currentUser = null,
		canMaintain = false
	}: {
		title: string;
		comments: ReviewComment[];
		onSubmit: (body: string) => Promise<void> | void;
		onUpdate?: ((comment: ReviewComment, body: string) => Promise<void> | void) | null;
		onDelete?: ((comment: ReviewComment) => Promise<void> | void) | null;
		onCancel?: (() => void) | null;
		readonly?: boolean;
		placeholder?: string;
		showEmpty?: boolean;
		currentUser?: string | null;
		canMaintain?: boolean;
	} = $props();

	let body = $state('');
	let busy = $state(false);
	let editingId = $state<string | null>(null);
	let editingBody = $state('');
	let actionBusy = $state<string | null>(null);
	let pendingDeleteId = $state<string | null>(null);
	const ordered = $derived(
		[...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
	);

	async function handleSubmit(event: Event) {
		event.preventDefault();
		const value = body.trim();
		if (!value) return;
		busy = true;
		try {
			await onSubmit(value);
			body = '';
			onCancel?.();
		} finally {
			busy = false;
		}
	}

	function canEdit(comment: ReviewComment) {
		return Boolean(onUpdate && currentUser && comment.author === currentUser);
	}

	function canDelete(comment: ReviewComment) {
		return Boolean(onDelete && currentUser && (comment.author === currentUser || canMaintain));
	}

	function startEdit(comment: ReviewComment) {
		pendingDeleteId = null;
		editingId = comment.id;
		editingBody = comment.body;
	}

	async function saveEdit(comment: ReviewComment) {
		const value = editingBody.trim();
		if (!value || !onUpdate) return;
		actionBusy = `edit:${comment.id}`;
		try {
			await onUpdate(comment, value);
			editingId = null;
			editingBody = '';
		} finally {
			actionBusy = null;
		}
	}

	async function deleteComment(comment: ReviewComment) {
		if (!onDelete) return;
		if (pendingDeleteId !== comment.id) {
			pendingDeleteId = comment.id;
			editingId = null;
			return;
		}
		actionBusy = `delete:${comment.id}`;
		try {
			await onDelete(comment);
			pendingDeleteId = null;
		} finally {
			actionBusy = null;
		}
	}
</script>

<section class="grid gap-3">
	{#if title}
		<div class="flex items-center justify-between gap-3">
			<h3 class="text-sm font-medium text-[#eae9e4]">{title}</h3>
			{#if comments.length}
				<span class="text-xs text-[#6f6b5f]">{comments.length}</span>
			{/if}
		</div>
	{/if}

	<div class="grid gap-3">
		{#each ordered as comment}
			<div class="group grid grid-cols-[28px_1fr] gap-2">
				<div class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
					{#if comment.author_profile?.avatar_url}
						<img src={comment.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />
					{:else}
						{userInitials(comment.author, comment.author_profile)}
					{/if}
				</div>
				<div class="min-w-0 border-l border-[#2a2a28] pl-3">
					<div class="flex flex-wrap items-center gap-2 text-xs">
						<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<span class="font-medium text-[#eae9e4]">{userDisplayName(comment.author, comment.author_profile)}</span>
							<span class="text-[#6f6b5f]">{new Date(comment.created_at).toLocaleString()}</span>
						</div>
						{#if canEdit(comment) || canDelete(comment)}
							<div class="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
								{#if canEdit(comment)}
									<button
										type="button"
										class="flex h-6 w-6 items-center justify-center rounded text-[#8c887e] hover:bg-[#242420] hover:text-[#eae9e4]"
										aria-label="Edit comment"
										onclick={() => startEdit(comment)}
									>
										<Pencil class="h-3.5 w-3.5" />
									</button>
								{/if}
								{#if canDelete(comment)}
									<button
										type="button"
										class="flex h-6 items-center justify-center rounded px-1.5 text-[#8c887e] hover:bg-[#2b1b18] hover:text-[#d96c5a]"
										aria-label="Delete comment"
										disabled={actionBusy === `delete:${comment.id}`}
										onclick={() => deleteComment(comment)}
									>
										{#if pendingDeleteId === comment.id}
											<span class="text-[11px]">Delete?</span>
										{:else}
											<Trash2 class="h-3.5 w-3.5" />
										{/if}
									</button>
								{/if}
							</div>
						{/if}
					</div>
					{#if editingId === comment.id}
						<div class="mt-2 grid gap-2">
							<textarea
								class="min-h-[76px] resize-y rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline outline-1 outline-[#2a2a28] placeholder:text-[#5f5b52] focus:outline-[#4a4942]"
								bind:value={editingBody}
							></textarea>
							<div class="flex justify-end gap-2">
								<button
									type="button"
									class="rounded bg-[#242420] px-3 py-1.5 text-xs font-medium text-[#d8d5ca] hover:bg-[#2f2f2b]"
									onclick={() => { editingId = null; editingBody = ''; }}
								>
									Cancel
								</button>
								<button
									type="button"
									class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-50"
									disabled={actionBusy === `edit:${comment.id}` || !editingBody.trim()}
									onclick={() => saveEdit(comment)}
								>
									{actionBusy === `edit:${comment.id}` ? 'Saving...' : 'Save'}
								</button>
							</div>
						</div>
					{:else}
						<p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#d8d5ca]">{comment.body}</p>
					{/if}
				</div>
			</div>
		{:else}
			{#if showEmpty}
				<p class="text-sm text-[#6f6b5f]">No comments yet.</p>
			{/if}
		{/each}
	</div>

	{#if !readonly}
		<form class="grid gap-2" onsubmit={handleSubmit}>
			<textarea
				class="min-h-[88px] resize-y rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline outline-1 outline-[#2a2a28] placeholder:text-[#5f5b52] focus:outline-[#4a4942]"
				{placeholder}
				bind:value={body}
			></textarea>
			<div class="flex justify-end">
				{#if onCancel}
					<button
						type="button"
						class="mr-2 rounded bg-[#242420] px-3 py-1.5 text-xs font-medium text-[#d8d5ca] hover:bg-[#2f2f2b]"
						onclick={onCancel}
					>
						Cancel
					</button>
				{/if}
				<button
					type="submit"
					class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-50"
					disabled={busy || !body.trim()}
				>
					{busy ? 'Posting...' : 'Comment'}
				</button>
			</div>
		</form>
	{/if}
</section>
