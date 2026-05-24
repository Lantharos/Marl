<script lang="ts">
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
</script>

<svelte:head>
	<title>PIG Concepts - sty docs</title>
	<meta name="description" content="PIG concepts: saves, packs, workspaces, snapshots, trees, objects, intents, operations, stash, and signing." />
</svelte:head>

<DocsPage
	title="PIG concepts"
	description="PIG exposes human-sized nouns while storing immutable, content-addressed objects under the hood."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">User-facing model</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[160px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Workspace</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A named line of work. <code>main</code> exists by default. Child workspaces can be local-only, synced, ready for review, or merged.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[160px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Save</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A cheap local checkpoint of the working tree plus intent metadata.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[160px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Pack</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A history cleanup operation that replaces a stack of saves with one shareable snapshot.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[160px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Undo</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A forward restore snapshot. It does not erase old snapshots.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[160px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Operation</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A local metadata/history mutation such as save, pack, merge attempt, finalized merge, workspace move, or fetch hydration. Use <code>pig op log</code> and <code>pig op undo</code>.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[160px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Intent</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A semantic note extracted from supported code files, such as a changed function, type, import, or generated artifact signal.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Object model</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">PIG stores immutable objects under <code>.pig/objects</code>. Blobs are file bytes. Trees map safe path segments to child blobs or trees. Snapshots point at a root tree, parents, author metadata, optional signature, message, workspace id, and intents.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Safety rails</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Secret scanning blocks common private keys, hosted tokens, live Stripe keys, AWS access key ids, and secret-looking <code>.env</code> assignments.</li>
			<li>Downloaded objects are validated by kind, digest, references, and tree-entry safety before use.</li>
			<li>Merge conflicts are persisted as artifacts and can reuse recorded resolutions when the same conflict shape appears again.</li>
			<li>Generated files are marked in status and diff output so reviewers can treat them differently from hand-authored files.</li>
		</ul>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">What PIG is not</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">PIG does not have a Git staging area. It does not use Git packfiles, deltas, or GC behavior. It accepts some Git-shaped flags for muscle memory, but the mental model is workspace and snapshot based.</p>
	</section>
</DocsPage>
