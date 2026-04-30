<script lang="ts">
	import CommandList from '$lib/components/docs/CommandList.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { pigCommandGroups } from '$lib/docs/commands';
</script>

<svelte:head>
	<title>PIG Guide - sty docs</title>
	<meta name="description" content="PIG command guide for local snapshots, workspaces, sync, issues, releases, stash, and signing." />
</svelte:head>

<DocsPage
	title="PIG guide"
	description="PIG is the local VCS client. It is built for frequent checkpoints, workspace-first development, readable human output, and clean JSON output for agents."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Human mode and agent mode</h2>
		<div class="mt-4 grid gap-3 md:grid-cols-2">
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Default output</h3>
				<p class="mt-2 text-sm leading-6 text-[#8c887e]">Commands print compact summaries, tables, and progress spinners for blocking work.</p>
			</div>
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">--json</h3>
				<p class="mt-2 text-sm leading-6 text-[#8c887e]">Agents should pass <code>--json</code>. Output becomes machine-readable and progress noise is suppressed.</p>
			</div>
		</div>
	</section>

	<CommandList groups={pigCommandGroups} />
</DocsPage>
