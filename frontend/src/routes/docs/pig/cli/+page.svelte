<script lang="ts">
	import CommandList from '$lib/components/docs/CommandList.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { pigCommandGroups } from '$lib/docs/commands';
</script>

<svelte:head>
	<title>PIG CLI - sty docs</title>
	<meta name="description" content="PIG CLI command reference for saves, packs, workspaces, sync, review, releases, stash, and signing." />
</svelte:head>

<DocsPage
	title="PIG CLI"
	description="The PIG CLI is the local interface for saving work, managing workspaces, syncing with sty, and driving review from scripts or agents."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Output contract</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Human default</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Commands print compact summaries that are easy to read in a terminal.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Agent mode</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Pass <code>--json</code> for machine-readable output and quieter progress reporting.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Repository groups</h3>
				<p class="text-sm leading-6 text-[#8c887e]">When a folder contains multiple PIG repositories, status, diff, save, and sync commands scope themselves to the nested repository that owns each path.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Git-shaped aliases</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Flags such as <code>--short</code>, <code>--stat</code>, and <code>--name-only</code> exist so existing terminal habits still work.</p>
			</div>
		</div>
	</section>

	<CommandList groups={pigCommandGroups} />
</DocsPage>
