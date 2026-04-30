<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const createRelease = `POST /v1/tenants/:tenant/projects/:project/releases
Authorization: Bearer <maintainer-token>
Content-Type: application/json

{
  "tag": "v1.0.0",
  "name": "First public build",
  "notes": "Changelog text"
}`;

	const uploadArtifact = `POST /v1/tenants/:tenant/projects/:project/releases/:release/artifacts
Authorization: Bearer <maintainer-token>
Content-Type: multipart/form-data

file=<binary>`;
</script>

<svelte:head>
	<title>Releases - sty docs</title>
	<meta name="description" content="sty releases with changelog notes, pinned source snapshots, uploaded artifacts, and public release downloads." />
</svelte:head>

<DocsPage
	title="Releases"
	description="A release is a changelog entry plus a pinned source snapshot and optional artifacts stored by sty. Maintainers can expose release downloads even when the project code stays private."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Create a release</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">When a release is created, sty attaches the latest project snapshot so the code state remains inspectable even if the workspace moves later.</p>
		<div class="mt-4">
			<CodeBlock code={createRelease} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Upload artifacts</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Artifacts are uploaded to sty storage. The release response includes artifact metadata and a stable download URL.</p>
		<div class="mt-4">
			<CodeBlock code={uploadArtifact} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Public downloads for private projects</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Project maintainers can enable public release metadata and artifact downloads without making the project public. Code, issues, workspaces, history, and settings still require normal project access.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">PIG commands</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[260px_1fr]">
				<code class="text-sm text-[#d9a66c]">pig release list</code>
				<p class="text-sm leading-6 text-[#a09d94]">List releases with pagination.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[260px_1fr]">
				<code class="text-sm text-[#d9a66c]">pig release new v1.0.0 --name "v1"</code>
				<p class="text-sm leading-6 text-[#a09d94]">Create a release from the latest source snapshot.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[260px_1fr]">
				<code class="text-sm text-[#d9a66c]">pig release view v1.0.0</code>
				<p class="text-sm leading-6 text-[#a09d94]">Show notes, source snapshot, and artifacts.</p>
			</div>
		</div>
	</section>
</DocsPage>
