<script lang="ts">
	import { marked } from 'marked';

	let { source }: { source: string } = $props();

	const html = $derived(marked.parse(source, { gfm: true, breaks: true }) as string);
</script>

<div class="markdown-body text-sm leading-relaxed text-[#eae9e4]">
	{@html html}
</div>

<style>
	:global(.markdown-body h1) {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 1.5rem 0 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #2a2a28;
		color: #f0eee4;
	}
	:global(.markdown-body > *:first-child) {
		margin-top: 0;
	}
	:global(.markdown-body h2) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 1.25rem 0 0.5rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid #2a2a28;
		color: #f0eee4;
	}
	:global(.markdown-body h3) {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 1rem 0 0.5rem;
		color: #eae9e4;
	}
	:global(.markdown-body p) {
		margin: 0.5rem 0;
	}
	:global(.markdown-body a) {
		color: #6ba4c7;
		text-decoration: none;
	}
	:global(.markdown-body a:hover) {
		text-decoration: underline;
	}
	:global(.markdown-body ul, .markdown-body ol) {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}
	:global(.markdown-body li) {
		margin: 0.25rem 0;
	}
	:global(.markdown-body code) {
		background: #1e1e1c;
		padding: 0.15rem 0.35rem;
		border-radius: 4px;
		font-size: 0.85em;
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
	}
	:global(.markdown-body pre) {
		background: #0f0f0d;
		border: 1px solid #2a2a28;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		overflow-x: auto;
		margin: 0.75rem 0;
	}
	:global(.markdown-body pre code) {
		background: transparent;
		padding: 0;
		font-size: 0.8em;
	}
	:global(.markdown-body blockquote) {
		border-left: 3px solid #2a2a28;
		margin: 0.75rem 0;
		padding-left: 1rem;
		color: #a09d94;
	}
	:global(.markdown-body hr) {
		border: 0;
		border-top: 1px solid #2a2a28;
		margin: 1rem 0;
	}
	:global(.markdown-body table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0.75rem 0;
		font-size: 0.9em;
	}
	:global(.markdown-body th, .markdown-body td) {
		border: 1px solid #2a2a28;
		padding: 0.4rem 0.6rem;
		text-align: left;
	}
	:global(.markdown-body th) {
		background: #1a1a18;
		font-weight: 600;
	}
	:global(.markdown-body tr:nth-child(even)) {
		background: #141412;
	}
	:global(.markdown-body img) {
		max-width: 100%;
		border-radius: 4px;
	}
</style>
