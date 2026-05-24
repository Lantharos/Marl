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
	title="PIG overview"
	description="PIG is a local-first VCS for stacked, reviewable software changes. It is designed for humans and agents that save often, clean up later, and sync when work is ready."
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

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Core loop</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<code class="text-sm text-[#d9a66c]">save</code>
				<p class="text-sm leading-6 text-[#8c887e]">Checkpoint meaningful local work. Saves are cheap and reversible.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<code class="text-sm text-[#d9a66c]">pack</code>
				<p class="text-sm leading-6 text-[#8c887e]">Turn noisy local saves into one shareable checkpoint before review or sync.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<code class="text-sm text-[#d9a66c]">work</code>
				<p class="text-sm leading-6 text-[#8c887e]">Create, switch, move, ready, and merge named workspaces instead of juggling branch refs.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<code class="text-sm text-[#d9a66c]">sync</code>
				<p class="text-sm leading-6 text-[#8c887e]">Transfer immutable objects, compare workspace heads, push, pull, or open a conflict resolver.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[150px_1fr]">
				<code class="text-sm text-[#d9a66c]">op</code>
				<p class="text-sm leading-6 text-[#8c887e]">Inspect and undo local VCS operations that changed metadata or history.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Detailed pages</h2>
		<div class="mt-4 grid gap-2">
			<a class="border-b border-[#252522] py-3 text-sm text-[#d9a66c] hover:text-[#e6bd86]" href="/docs/pig/concepts">PIG concepts</a>
			<a class="border-b border-[#252522] py-3 text-sm text-[#d9a66c] hover:text-[#e6bd86]" href="/docs/pig/workflow">Daily workflow</a>
			<a class="border-b border-[#252522] py-3 text-sm text-[#d9a66c] hover:text-[#e6bd86]" href="/docs/pig/cli">PIG CLI</a>
			<a class="border-b border-[#252522] py-3 text-sm text-[#d9a66c] hover:text-[#e6bd86]" href="/docs/pig/sync">Sync and remotes</a>
			<a class="py-3 text-sm text-[#d9a66c] hover:text-[#e6bd86]" href="/docs/pig/agents">Agents and MCP</a>
		</div>
	</section>

	<CommandList groups={pigCommandGroups.slice(0, 3)} />
</DocsPage>
