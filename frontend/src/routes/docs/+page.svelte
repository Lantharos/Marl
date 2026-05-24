<script lang="ts">
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { docsNav } from '$lib/docs/navigation';
</script>

<svelte:head>
	<title>Docs - sty</title>
	<meta name="description" content="Documentation for sty, PIG, the remote API, OAuth integrations, webhooks, API keys, and releases." />
</svelte:head>

<DocsPage
	title="sty docs"
	description="One docs surface for the hosted product, the local VCS, the remote protocol, and agent workflows."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Choose a path</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<a class="block border-b border-[#252522] px-4 py-4 hover:bg-[#141412]" href="/docs/getting-started">
				<div class="text-sm font-medium text-[#f0eee4]">I want to use sty with a repo</div>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]">Install sty, sign in, connect <code>tenant/project</code>, save work, and sync.</p>
			</a>
			<a class="block border-b border-[#252522] px-4 py-4 hover:bg-[#141412]" href="/docs/sty">
				<div class="text-sm font-medium text-[#f0eee4]">I want to understand the hosted product</div>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]">Tenants, projects, collaborators, review, releases, public pages, automation, and local development.</p>
			</a>
			<a class="block border-b border-[#252522] px-4 py-4 hover:bg-[#141412]" href="/docs/pig">
				<div class="text-sm font-medium text-[#f0eee4]">I want to understand PIG commands</div>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]">Saves, packs, workspaces, stash, merge conflicts, signing, partial fetch, remote sync, and JSON output.</p>
			</a>
			<a class="block px-4 py-4 hover:bg-[#141412]" href="/docs/api">
				<div class="text-sm font-medium text-[#f0eee4]">I want to build an integration</div>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]">Use project API keys, OAuth apps, webhooks, releases, and the remote protocol.</p>
			</a>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">How the pieces fit</h2>
		<div class="mt-4 grid gap-4">
			<div class="grid gap-3 border-l border-[#3a3a36] pl-4 md:grid-cols-[120px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">PIG</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Runs in your repo. It creates snapshots, switches workspaces, stashes changes, signs saves, and syncs with a configured remote.</p>
			</div>
			<div class="grid gap-3 border-l border-[#3a3a36] pl-4 md:grid-cols-[120px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">sty</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Hosts projects under tenant namespaces. It owns sign-in, permissions, issues, releases, webhooks, API keys, OAuth apps, and project pages.</p>
			</div>
			<div class="grid gap-3 border-l border-[#3a3a36] pl-4 md:grid-cols-[120px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Protocol</h3>
				<p class="text-sm leading-6 text-[#8c887e]">PIG asks the remote what it supports before using optional features. Agents should use <code>--json</code>; humans get readable output.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Reference pages</h2>
		<div class="mt-4 grid gap-2">
			{#each docsNav.filter((item) => item.href !== '/docs') as item (item.href)}
				<a class="flex items-center justify-between gap-4 border-b border-[#252522] py-3 text-sm hover:text-[#d9a66c]" href={item.href}>
					<span class="text-[#eae9e4]">{item.title}</span>
					<span class="text-right text-[#6f6b5f]">{item.description}</span>
				</a>
			{/each}
		</div>
	</section>

	<section class="rounded border border-[#2a2a28] bg-[#141412] p-4">
		<h2 class="text-lg font-semibold text-[#eae9e4]">Agent index</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">A compact text version of the docs is available at <a class="text-[#d9a66c] hover:text-[#e6bd86]" href="/docs/llms.txt">/docs/llms.txt</a>. Use it when an agent needs the command and endpoint surface without reading the visual docs.</p>
	</section>
</DocsPage>
