<script module lang="ts">
	export type ComposerAction = {
		value: string;
		label: string;
		withContentLabel?: string;
		description?: string;
		disabled?: boolean;
		requiresContent?: boolean;
		danger?: boolean;
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Link2 from 'lucide-svelte/icons/link-2';
	import MessageSquare from 'lucide-svelte/icons/message-square';

	let {
		value,
		placeholder = 'Leave a comment...',
		submitLabel = 'Comment',
		disabled = false,
		busy = false,
		actionBusy = false,
		minHeight = '150px',
		actions = [],
		onInput,
		onSubmit = null,
		onAction = null,
		onCancel = null
	}: {
		value: string;
		placeholder?: string;
		submitLabel?: string;
		disabled?: boolean;
		busy?: boolean;
		actionBusy?: boolean;
		minHeight?: string;
		actions?: ComposerAction[];
		onInput: (value: string) => void;
		onSubmit?: (() => Promise<void> | void) | null;
		onAction?: ((body: string, action: string) => Promise<void> | void) | null;
		onCancel?: (() => void) | null;
	} = $props();

	let mode = $state<'write' | 'preview'>('write');
	let textarea = $state<HTMLTextAreaElement | null>(null);
	let actionMenuOpen = $state(false);
	let selectedActionValue = $state<string | null>(null);
	const selectedAction = $derived(
		actions.find((action) => action.value === selectedActionValue) ?? actions[0] ?? null
	);

	$effect(() => {
		if (!actions.length) {
			selectedActionValue = null;
		} else if (!selectedAction) {
			selectedActionValue = actions[0].value;
		}
	});

	async function setText(next: string, selectionStart: number, selectionEnd = selectionStart) {
		onInput(next);
		mode = 'write';
		await tick();
		textarea?.focus();
		textarea?.setSelectionRange(selectionStart, selectionEnd);
	}

	function selectedRange() {
		return {
			start: textarea?.selectionStart ?? value.length,
			end: textarea?.selectionEnd ?? value.length
		};
	}

	function lineStart(index: number) {
		const previousNewline = value.lastIndexOf('\n', Math.max(0, index - 1));
		return previousNewline + 1;
	}

	async function wrapSelection(prefix: string, suffix = prefix, placeholder = 'text') {
		const { start, end } = selectedRange();
		const selected = value.slice(start, end) || placeholder;
		const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
		const selectedStart = start + prefix.length;
		await setText(next, selectedStart, selectedStart + selected.length);
	}

	async function prefixLines(prefix: string, placeholder = 'Heading') {
		const { start, end } = selectedRange();
		const insertAt = lineStart(start);
		const selected = value.slice(insertAt, end);
		const nextBlock = selected
			? selected
					.split('\n')
					.map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
					.join('\n')
			: `${prefix}${placeholder}`;
		const next = `${value.slice(0, insertAt)}${nextBlock}${value.slice(end)}`;
		const cursor = insertAt + prefix.length;
		await setText(next, cursor, selected ? insertAt + nextBlock.length : insertAt + nextBlock.length);
	}

	async function insertLink() {
		const { start, end } = selectedRange();
		const label = value.slice(start, end) || 'link text';
		const url = 'https://';
		const next = `${value.slice(0, start)}[${label}](${url})${value.slice(end)}`;
		const urlStart = start + label.length + 3;
		await setText(next, urlStart, urlStart + url.length);
	}

	async function submit() {
		if (!onSubmit || disabled || busy || !value.trim()) return;
		await onSubmit();
	}

	function actionLabel(action: ComposerAction) {
		return value.trim() ? (action.withContentLabel ?? `${action.label} with comment`) : action.label;
	}

	function actionDisabled(action: ComposerAction | null) {
		return !action || disabled || busy || actionBusy || Boolean(action.disabled) || (Boolean(action.requiresContent) && !value.trim());
	}

	async function runAction(action: ComposerAction | null) {
		if (!action || !onAction || actionDisabled(action)) return;
		actionMenuOpen = false;
		await onAction(value.trim(), action.value);
		onInput('');
	}
</script>

<div class="border border-[#2a2a28] bg-[#0f0f0d]">
	<div class="flex min-h-10 items-center justify-between border-b border-[#252522] bg-[#141412]">
		<div class="flex h-10">
			<button
				class="border-r border-[#252522] px-3 text-sm {mode === 'write' ? 'bg-[#0f0f0d] text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}"
				onclick={() => (mode = 'write')}
				type="button"
			>
				Write
			</button>
			<button
				class="border-r border-[#252522] px-3 text-sm {mode === 'preview' ? 'bg-[#0f0f0d] text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}"
				onclick={() => (mode = 'preview')}
				type="button"
			>
				Preview
			</button>
		</div>
		<div class="flex items-center gap-1 px-2 text-[#8c887e]">
			<button class="px-2 py-1 text-sm font-semibold hover:text-[#eae9e4]" type="button" aria-label="Add heading" onclick={() => prefixLines('## ')}>H</button>
			<button class="px-2 py-1 text-sm font-semibold hover:text-[#eae9e4]" type="button" aria-label="Add bold text" onclick={() => wrapSelection('**', '**', 'bold text')}>B</button>
			<button class="px-2 py-1 text-sm italic hover:text-[#eae9e4]" type="button" aria-label="Add italic text" onclick={() => wrapSelection('_', '_', 'italic text')}>I</button>
			<button class="px-2 py-1 font-mono text-sm hover:text-[#eae9e4]" type="button" aria-label="Add code" onclick={() => wrapSelection('`', '`', 'code')}>{"<>"}</button>
			<button class="px-2 py-1 hover:text-[#eae9e4]" type="button" aria-label="Add link" onclick={insertLink}><Link2 class="h-4 w-4" /></button>
		</div>
	</div>
	{#if mode === 'write'}
		<textarea
			bind:this={textarea}
			class="composer-input block w-full resize-y bg-[#0f0f0d] px-3 py-3 text-sm leading-6 text-[#eae9e4] placeholder:text-[#6f6b5f]"
			style:min-height={minHeight}
			{placeholder}
			value={value}
			oninput={(event) => onInput((event.currentTarget as HTMLTextAreaElement).value)}
		></textarea>
	{:else}
		<div class="min-h-[150px] px-3 py-3">
			{#if value.trim()}
				<Markdown source={value} />
			{:else}
				<p class="text-sm text-[#6f6b5f]">Nothing to preview.</p>
			{/if}
		</div>
	{/if}
	<div class="flex flex-wrap items-center justify-between gap-3 border-t border-[#252522] px-3 py-2">
		<div class="flex items-center gap-2 text-xs text-[#8c887e]"><MessageSquare class="h-3.5 w-3.5" /> Markdown is supported</div>
		{#if onSubmit || (onAction && actions.length)}
			<div class="flex items-center gap-2">
				{#if onAction && actions.length}
					<div class="relative flex">
						<button
							class="h-8 bg-[#242420] px-3 text-sm text-[#eae9e4] hover:bg-[#2f2f2b] disabled:opacity-50"
							type="button"
							disabled={actionDisabled(selectedAction)}
							onclick={() => runAction(selectedAction)}
						>
							{selectedAction ? actionLabel(selectedAction) : 'Action'}
						</button>
						<button
							class="ml-px grid h-8 w-8 place-items-center bg-[#242420] text-[#eae9e4] hover:bg-[#2f2f2b] disabled:opacity-50"
							type="button"
							disabled={disabled || busy || actionBusy}
							aria-label="Choose action"
							onclick={() => (actionMenuOpen = !actionMenuOpen)}
						>
							<ChevronDown class="h-3.5 w-3.5" />
						</button>
						{#if actionMenuOpen}
							<div class="absolute bottom-9 left-0 z-30 w-max min-w-64 border border-[#2a2a28] bg-[#141412] p-1 shadow-xl">
								{#each actions as action}
									<button
										type="button"
										class="block w-full whitespace-nowrap px-3 py-2 text-left text-sm hover:bg-[#1e1e1c] disabled:text-[#5f5b52] {action.danger ? 'text-[#d96c5a]' : selectedAction?.value === action.value ? 'text-[#f0eee4]' : 'text-[#d8d5ca]'}"
										disabled={Boolean(action.disabled)}
										onclick={() => {
											selectedActionValue = action.value;
											actionMenuOpen = false;
										}}
									>
										<span class="block">{actionLabel(action)}</span>
										{#if action.description}
											<span class="block text-xs text-[#8c887e]">{action.description}</span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
				{#if onCancel}
					<button class="px-3 py-1.5 text-sm text-[#a09d94] hover:text-[#eae9e4]" type="button" onclick={onCancel}>Cancel</button>
				{/if}
				{#if onSubmit}
					<button
						class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50"
						type="button"
						disabled={disabled || busy || !value.trim()}
						onclick={submit}
					>
						{busy ? 'Saving...' : submitLabel}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.composer-input:focus,
	.composer-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
