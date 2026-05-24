<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { pathClosureJson, pathClosureResponseJson, protocolCapabilities } from '$lib/docs/protocol';

	const compareAndSwap = `PUT /v1/tenants/:tenant/projects/:project/workspaces/:workspace/head
Authorization: Bearer <token>
Content-Type: application/json

{
  "expected": "<old-head-or-null>",
  "head": "<new-snapshot-id>",
  "force": false
}`;

	const batchDownload = `POST /v1/tenants/:tenant/projects/:project/objects/download
Authorization: Bearer <token>
Content-Type: application/json

{
  "objects": ["<snapshot-id>", "<tree-id>", "<blob-id>"]
}`;
</script>

<svelte:head>
	<title>Remote Protocol - sty docs</title>
	<meta name="description" content="sty remote protocol details for PIG clients, including capabilities, object transfer, path closure, and workspace heads." />
</svelte:head>

<DocsPage
	title="Remote protocol"
	description="The remote protocol is the contract between PIG clients and sty-compatible servers. It is object-oriented, capability-gated, and conservative about workspace head changes."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Capabilities</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Clients should read capabilities before assuming optional behavior. Unsupported capabilities should degrade to local-only behavior or a clear error.</p>
		<div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each protocolCapabilities as capability (capability)}
				<code class="rounded border border-[#2a2a28] px-3 py-2 text-sm text-[#d9a66c]">{capability}</code>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Objects</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Snapshots, trees, blobs, and derived metadata are addressed by immutable ids. A server should reject a workspace head if the referenced object graph is incomplete.</p>
		<div class="mt-4">
			<CodeBlock code={batchDownload} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Path closure</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Path closure lets a client fetch one file or directory without downloading the full workspace tree. The response includes every object needed to verify and hydrate that path.</p>
		<div class="mt-4 grid gap-4 lg:grid-cols-2">
			<CodeBlock label="Request" code={pathClosureJson} />
			<CodeBlock label="Response" code={pathClosureResponseJson} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Workspace heads</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Head updates are compare-and-swap by default. A client sends the head it expects to replace; the server returns a conflict when the remote moved. Force is explicit and should be shown to the user before replacing history.</p>
		<div class="mt-4">
			<CodeBlock code={compareAndSwap} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Server requirements</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Store enough base information to merge reviewed work with the current parent head, not with a stale workspace tree.</li>
			<li>Persist reactions, approvals, check runs, comments, and ready metadata instead of returning placeholder data.</li>
			<li>Enforce scopes on every endpoint and keep main write access separate from feature workspace writes.</li>
			<li>Make object reads bounded: batch downloads, path closure, pagination, cursors, and cacheable immutable objects should be preferred over broad tree reads.</li>
		</ul>
	</section>
</DocsPage>
