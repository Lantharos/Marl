<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const setup = `sty login
sty init lantharos/editor
pig remote show
pig sync`;

	const partialFetch = `pig fetch path src/parser
pig fetch path src/parser --no-hydrate
pig fetch path src/parser --snapshot <snapshot-id>

sty clone lantharos/editor ./parser-only --include src/parser`;

	const historyRewrite = `pig pack 3 "clean parser work"
pig sync --force`;
</script>

<svelte:head>
	<title>PIG Sync and Remotes - sty docs</title>
	<meta name="description" content="How PIG syncs with sty remotes, including object transfer, force sync, partial fetch, and merge safety." />
</svelte:head>

<DocsPage
	title="Sync and remotes"
	description="Sync moves immutable objects and workspace heads between local PIG repositories and a sty-compatible remote."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Connect and sync</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use sty to create the hosted project and write the remote config. After that, <code>pig sync</code> is the normal transport command.</p>
		<div class="mt-4">
			<CodeBlock code={setup} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">What sync does</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Capabilities</h3>
				<p class="text-sm leading-6 text-[#8c887e]">The client reads the remote feature list before using optional protocol surfaces such as comments, checks, path closure, or batch object download.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Objects</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Missing blobs, trees, snapshots, and derived metadata are uploaded or downloaded by immutable object id. Uploads use bounded batches when the remote supports them, fall back to single-object uploads when needed, and mark completed batches locally so interrupted syncs can resume cleanly.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Heads</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Workspace heads advance with compare-and-swap. If the remote moved, PIG pulls, fast-forwards, or opens a merge path instead of silently overwriting it.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Dirty files</h3>
				<p class="text-sm leading-6 text-[#8c887e]">When a remote workspace was merged or deleted, PIG can return you to the parent workspace while keeping local uncommitted file changes in the working tree.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Partial fetch</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use path fetch when a tool needs one file or directory from a large remote history. Hydration writes the path into the working tree; <code>--no-hydrate</code> only caches the object closure locally.</p>
		<div class="mt-4">
			<CodeBlock code={partialFetch} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Force sync</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use force sync only when you intentionally rewrote local save history, usually after packing saves that were already uploaded. The client shows the replacement before it updates the remote head.</p>
		<div class="mt-4">
			<CodeBlock code={historyRewrite} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Merge safety</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Local workspace merges use a three-way base and can record reusable conflict resolutions.</li>
			<li>Remote merge endpoints must validate that the reviewed workspace head is still current before creating the parent result.</li>
			<li>Merge rules can require approvals, passing checks, current-head approvals, and resolved file conversations.</li>
			<li>Clients should prefer explicit conflict resolution over replacing remote heads unless the user chose <code>--force</code>.</li>
		</ul>
	</section>
</DocsPage>
