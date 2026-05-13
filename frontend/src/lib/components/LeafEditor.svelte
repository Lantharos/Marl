<script lang="ts">
	import ContentComposer from '$lib/components/ContentComposer.svelte';
	import type { Leaf, LeafDraft } from '$lib/api';
	import Building2 from 'lucide-svelte/icons/building-2';
	import Check from 'lucide-svelte/icons/check';
	import Circle from 'lucide-svelte/icons/circle';
	import FolderGit2 from 'lucide-svelte/icons/folder-git-2';
	import GitBranch from 'lucide-svelte/icons/git-branch';
	import GitCommit from 'lucide-svelte/icons/git-commit';
	import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
	import Pin from 'lucide-svelte/icons/pin';
	import Tag from 'lucide-svelte/icons/tag';

	let {
		leaf = null,
		submitLabel = 'Save leaf',
		defaultAttachment = 'project',
		busy = false,
		canPin = false,
		onSave,
		onCancel = null
	}: {
		leaf?: Leaf | null;
		submitLabel?: string;
		defaultAttachment?: LeafDraft['attached_type'];
		busy?: boolean;
		canPin?: boolean;
		onSave: (draft: LeafDraft) => Promise<void> | void;
		onCancel?: (() => void) | null;
	} = $props();

	let title = $state('');
	let slug = $state('');
	let visibility = $state<LeafDraft['visibility']>('tenant');
	let attachedType = $state<LeafDraft['attached_type']>('project');
	let attachedId = $state('');
	let tagsInput = $state('');
	let pinned = $state(false);
	let body = $state('');
	let error = $state('');
	let loadedKey = $state('');

	const visibilityOptions = [
		{ value: 'private', label: 'Private' },
		{ value: 'tenant', label: 'Tenant' },
		{ value: 'public', label: 'Public' }
	] as const;
	const attachmentOptions = [
		{
			value: 'tenant',
			label: 'Tenant',
			hint: 'General notes for the tenant.',
			placeholder: '',
			needsId: false,
			icon: Building2
		},
		{
			value: 'project',
			label: 'Project',
			hint: 'Project memory, setup notes, TODOs, and snippets.',
			placeholder: '',
			needsId: false,
			icon: FolderGit2
		},
		{
			value: 'branch',
			label: 'Branch',
			hint: 'Attach to a named branch or workspace line of work.',
			placeholder: 'main, feature-auth',
			needsId: true,
			icon: GitBranch
		},
		{
			value: 'commit',
			label: 'Commit',
			hint: 'Explain a specific change or why a snapshot exists.',
			placeholder: 'snapshot or commit id',
			needsId: true,
			icon: GitCommit
		},
		{
			value: 'issue',
			label: 'Issue',
			hint: 'Keep investigation notes beside an issue.',
			placeholder: '#12 or issue id',
			needsId: true,
			icon: Circle
		},
		{
			value: 'workspace',
			label: 'Workspace',
			hint: 'Track notes for an open or merged workspace.',
			placeholder: 'feature-dashboard',
			needsId: true,
			icon: GitPullRequest
		},
		{
			value: 'release',
			label: 'Release',
			hint: 'Draft or preserve release context.',
			placeholder: 'v1.0.0',
			needsId: true,
			icon: Tag
		}
	] as const;
	const selectedAttachment = $derived(
		attachmentOptions.find((option) => option.value === attachedType) ?? attachmentOptions[0]
	);

	$effect(() => {
		const key = leaf?.id ?? `new:${defaultAttachment}`;
		if (loadedKey === key) return;
		loadedKey = key;
		title = leaf?.title ?? '';
		slug = leaf?.slug ?? '';
		visibility = leaf?.visibility ?? 'tenant';
		attachedType = leaf?.attached_type ?? defaultAttachment;
		attachedId = leaf?.attached_id ?? '';
		tagsInput = (leaf?.tags ?? []).join(', ');
		pinned = Boolean(leaf?.pinned);
		body = leaf?.body ?? '';
	});

	function chooseAttachment(value: LeafDraft['attached_type']) {
		attachedType = value;
		const option = attachmentOptions.find((item) => item.value === value);
		if (!option?.needsId) attachedId = '';
	}

	async function save() {
		error = '';
		if (!title.trim()) {
			error = 'Title is required';
			return;
		}
		const normalizedAttachmentId = selectedAttachment.needsId ? attachedId.trim() : '';
		if (selectedAttachment.needsId && !normalizedAttachmentId) {
			error = `${selectedAttachment.label} leaves need a reference`;
			return;
		}
		const draft: LeafDraft = {
			title: title.trim(),
			body,
			visibility,
			attached_type: attachedType,
			attached_id: normalizedAttachmentId || null,
			tags: tagsInput
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean),
			pinned
		};
		if (slug.trim()) draft.slug = slug.trim();
		await onSave(draft);
	}
</script>

<div class="grid border border-[#2a2a28] bg-[#141412] lg:grid-cols-[minmax(0,1fr)_280px]">
	<div class="min-w-0">
		<div class="space-y-4 border-b border-[#252522] p-4">
			<label class="block text-sm font-medium text-[#eae9e4]">
				<span>Title</span>
				<input
					class="leaf-input mt-2 block h-10 w-full border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]"
					placeholder="Release checklist, auth helper, design notes"
					bind:value={title}
				/>
			</label>

			<div>
				<div class="mb-2 text-sm font-medium text-[#eae9e4]">Attach to</div>
				<div class="flex flex-wrap gap-2">
					{#each attachmentOptions as option (option.value)}
						{@const OptionIcon = option.icon}
						<button
							type="button"
							class="inline-flex h-9 items-center gap-2 border px-3 text-sm {attachedType === option.value ? 'border-[#d9a66c] bg-[#1e1e1c] text-[#f0eee4]' : 'border-[#2a2a28] text-[#a09d94] hover:bg-[#191917] hover:text-[#eae9e4]'}"
							onclick={() => chooseAttachment(option.value)}
						>
							<OptionIcon class="h-3.5 w-3.5 shrink-0 {attachedType === option.value ? 'text-[#d9a66c]' : 'text-[#6f6b5f]'}" />
							{option.label}
						</button>
					{/each}
				</div>
				{#if selectedAttachment.needsId}
					<label class="mt-3 grid gap-2 text-sm font-medium text-[#eae9e4] md:grid-cols-[110px_minmax(0,1fr)] md:items-center">
						<span>Reference</span>
						<input
							class="leaf-input block h-9 w-full border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]"
							placeholder={selectedAttachment.placeholder}
							bind:value={attachedId}
						/>
					</label>
				{/if}
			</div>
		</div>

		<div class="p-4">
			<ContentComposer
				value={body}
				placeholder="Write notes, snippets, commands, or project context..."
				submitLabel={submitLabel}
				minHeight="320px"
				busy={busy}
				onInput={(value) => (body = value)}
				onSubmit={save}
				{onCancel}
			/>
			{#if error}
				<div class="mt-3 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
			{/if}
		</div>
	</div>

	<aside class="space-y-4 border-t border-[#252522] p-4 lg:border-l lg:border-t-0">
		<label class="block text-sm font-medium text-[#eae9e4]">
			<span>Slug</span>
			<input
				class="leaf-input mt-2 block h-9 w-full border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]"
				placeholder="auto"
				bind:value={slug}
			/>
		</label>

		<div>
			<div class="mb-2 text-sm font-medium text-[#eae9e4]">Visibility</div>
			<div class="grid grid-cols-3 gap-1">
				{#each visibilityOptions as option (option.value)}
					<button
						type="button"
						class="inline-flex h-8 items-center justify-center gap-1.5 border text-sm {visibility === option.value ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]'}"
						onclick={() => (visibility = option.value)}
					>
						{#if visibility === option.value}<Check class="h-3.5 w-3.5" />{/if}
						{option.label}
					</button>
				{/each}
			</div>
		</div>

		<label class="block text-sm font-medium text-[#eae9e4]">
			<span>Tags</span>
			<input
				class="leaf-input mt-2 block h-9 w-full border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]"
				placeholder="deploy, api, setup"
				bind:value={tagsInput}
			/>
		</label>

		{#if canPin}
			<button
				type="button"
				class="inline-flex h-9 w-full items-center justify-center gap-2 border text-sm {pinned ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]'}"
				onclick={() => (pinned = !pinned)}
			>
				<Pin class="h-3.5 w-3.5" />
				Pin on overview
			</button>
		{/if}
	</aside>
</div>

<style>
	.leaf-input:focus,
	.leaf-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
