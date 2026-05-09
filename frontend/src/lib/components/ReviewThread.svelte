<script lang="ts">
	import type { ReviewComment } from '$lib/api';
	import { userDisplayName, userInitials } from '$lib/identity';
	import Markdown from './Markdown.svelte';
	import ContentComposer, { type ComposerAction as SubmitAction } from './ContentComposer.svelte';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash2 from 'lucide-svelte/icons/trash-2';

	let {
		title,
		comments,
		onSubmit,
		onUpdate = null,
		onDelete = null,
		onResolve = null,
		onSubmitAction = null,
		onCancel = null,
		readonly = false,
		placeholder = 'Leave a review comment...',
		submitLabel = 'Comment',
		submitActions = [],
		showEmpty = true,
		currentUser = null,
		currentUserProfile = null,
		commentVariant = 'plain',
		composerVariant = 'plain',
		canMaintain = false
	}: {
		title: string;
		comments: ReviewComment[];
		onSubmit: (body: string) => Promise<void> | void;
		onUpdate?: ((comment: ReviewComment, body: string) => Promise<void> | void) | null;
		onDelete?: ((comment: ReviewComment) => Promise<void> | void) | null;
		onResolve?: ((comment: ReviewComment) => Promise<void> | void) | null;
		onSubmitAction?: ((body: string, action: string) => Promise<void> | void) | null;
		onCancel?: (() => void) | null;
		readonly?: boolean;
		placeholder?: string;
		submitLabel?: string;
		submitActions?: SubmitAction[];
		showEmpty?: boolean;
		currentUser?: string | null;
		currentUserProfile?: ReviewComment['author_profile'] | null;
		commentVariant?: 'plain' | 'timeline';
		composerVariant?: 'plain' | 'timeline';
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

	async function handleSubmit() {
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

	async function handleSubmitAction(value: string, actionValue: string) {
		const action = submitActions.find((item) => item.value === actionValue);
		if (!action || action.disabled || !onSubmitAction) return;
		if (action.requiresContent && !value.trim()) return;
		busy = true;
		try {
			await onSubmitAction(value.trim(), action.value);
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

	function canResolve(comment: ReviewComment) {
		return Boolean(onResolve && comment.state !== 'resolved');
	}

	function commentShellClass() {
		return commentVariant === 'timeline'
			? 'min-w-0 border border-[#2a2a28] bg-[#11110f]'
			: 'min-w-0 border-l border-[#2a2a28] pl-3';
	}

	function commentHeaderClass() {
		return commentVariant === 'timeline'
			? 'flex flex-wrap items-center gap-2 border-b border-[#252522] bg-[#181816] px-3 py-2 text-xs'
			: 'flex flex-wrap items-center gap-2 text-xs';
	}

	function commentBodyClass() {
		return commentVariant === 'timeline' ? 'px-3 py-3' : '';
	}

	function commentTextClass() {
		return commentVariant === 'timeline'
			? 'whitespace-pre-wrap text-sm leading-relaxed text-[#d8d5ca]'
			: 'mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#d8d5ca]';
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

	async function resolveComment(comment: ReviewComment) {
		if (!onResolve) return;
		actionBusy = `resolve:${comment.id}`;
		try {
			await onResolve(comment);
		} finally {
			actionBusy = null;
		}
	}
</script>

<section class="grid gap-3">
	{#if title && composerVariant !== 'timeline'}
		<div class="flex items-center justify-between gap-3">
			<h3 class="text-sm font-medium text-[#eae9e4]">{title}</h3>
			{#if comments.length}
				<span class="text-xs text-[#6f6b5f]">{comments.length}</span>
			{/if}
		</div>
	{/if}

	{#if ordered.length || showEmpty}
		<div class="grid gap-3">
		{#each ordered as comment}
			<div class="group relative z-10 grid grid-cols-[28px_1fr] gap-3">
				<div class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
					{#if comment.author_profile?.avatar_url}
						<img src={comment.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />
					{:else}
						{userInitials(comment.author, comment.author_profile)}
					{/if}
				</div>
				<div class={commentShellClass()}>
					<div class={commentHeaderClass()}>
						<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<span class="font-medium text-[#eae9e4]">{userDisplayName(comment.author, comment.author_profile)}</span>
							{#if commentVariant === 'timeline'}
								<span class="text-[#8c887e]">commented</span>
							{/if}
							<span class="text-[#6f6b5f]">{new Date(comment.created_at).toLocaleString()}</span>
						</div>
						{#if comment.state === 'resolved'}
							<span class="text-[#7cb97c]">resolved</span>
						{/if}
						{#if canEdit(comment) || canDelete(comment) || canResolve(comment)}
							<div class="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
								{#if canResolve(comment)}
									<button
										type="button"
										class="flex h-6 items-center justify-center rounded px-1.5 text-[11px] text-[#8c887e] hover:bg-[#142018] hover:text-[#7cb97c]"
										disabled={actionBusy === `resolve:${comment.id}`}
										onclick={() => resolveComment(comment)}
									>
										Resolve
									</button>
								{/if}
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
					<div class={commentBodyClass()}>
						{#if editingId === comment.id}
							<ContentComposer
								value={editingBody}
								placeholder="Edit comment..."
								minHeight="92px"
								submitLabel="Save"
								busy={actionBusy === `edit:${comment.id}`}
								disabled={!editingBody.trim()}
								onInput={(value) => (editingBody = value)}
								onSubmit={() => saveEdit(comment)}
								onCancel={() => { editingId = null; editingBody = ''; }}
							/>
						{:else}
							<div class={commentTextClass()}>
								<Markdown source={comment.body} />
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			{#if showEmpty}
				<p class="text-sm text-[#6f6b5f]">No comments yet.</p>
			{/if}
		{/each}
		</div>
	{/if}

	{#if !readonly}
		{#if composerVariant === 'timeline'}
			<div class="relative z-10 mt-3 grid grid-cols-[28px_1fr] gap-3 before:absolute before:left-[13px] before:top-[-1.75rem] before:h-[calc(1.75rem+14px)] before:w-px before:bg-[#252522]">
				<div class="{title ? 'mt-7 ' : ''}relative z-10 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
					{#if currentUserProfile?.avatar_url}
						<img src={currentUserProfile.avatar_url} alt="" class="h-full w-full object-cover" />
					{:else}
						{userInitials(currentUser ?? '', currentUserProfile)}
					{/if}
				</div>
				<div class="min-w-0">
					{#if title}
						<div class="mb-2 text-sm font-medium text-[#eae9e4]">{title}</div>
					{/if}
					<ContentComposer
						value={body}
						{placeholder}
						{submitLabel}
						minHeight="92px"
						{busy}
						actions={submitActions}
						onInput={(value) => (body = value)}
						onSubmit={handleSubmit}
						onAction={onSubmitAction ? handleSubmitAction : null}
						{onCancel}
					/>
				</div>
			</div>
		{:else}
			<ContentComposer
				value={body}
				{placeholder}
				{submitLabel}
				minHeight="92px"
				{busy}
				actions={submitActions}
				onInput={(value) => (body = value)}
				onSubmit={handleSubmit}
				onAction={onSubmitAction ? handleSubmitAction : null}
				{onCancel}
			/>
		{/if}
	{/if}
</section>
