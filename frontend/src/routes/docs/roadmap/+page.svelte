<script lang="ts">
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
</script>

<svelte:head>
	<title>Roadmap - sty docs</title>
	<meta name="description" content="What exists now in PIG and sty, what is intentionally deferred, and what remains future work." />
</svelte:head>

<DocsPage
	title="Roadmap"
	description="This page separates shipped behavior from planned hardening so teams can decide where PIG and sty fit today."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Exists now</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>PIG saves, packs, workspaces, local merge, operation log, operation undo, semantic query, secret scanning, generated-file markers, and conflict resolution reuse.</li>
			<li>Remote sync with object upload, compare-and-swap workspace heads, force sync for intentional rewrites, batch object download, and path-closure fetch.</li>
			<li>sty projects, tenants, folders, collaborators, private/team/public workspace visibility, ready review, comments, approvals, status checks, merge rules, notifications, and audit log entries.</li>
			<li>Project API keys, OAuth developer apps, webhooks, protocol hooks, releases, release artifacts, public project discovery, forks, and sendwork.</li>
			<li>Signing keys, SSH keys, signed snapshot verification, remote browser approvals, and granular protocol permissions.</li>
		</ul>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Intentionally deferred</h2>
		<div class="mt-4 grid gap-3">
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Built-in CI execution</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]">sty stores checks and exposes check APIs. Running arbitrary jobs requires an external runner or a future hosted runner product.</p>
			</div>
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">End-to-end encrypted projects</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]">Current access control is server-enforced. True E2EE would change search, review, diffing, merge preview, and web rendering.</p>
			</div>
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Git compatibility layer</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]">PIG is not a Git remote. Import/export and bridge tooling can exist, but the object model and workspace semantics are different.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Future hardening</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Deeper lazy history, larger-object transfer tuning, and more aggressive object batching for very large repositories.</li>
			<li>Policy controls for generated files, secret-sensitive paths, protected workspaces, and required review owners.</li>
			<li>First-class runner packaging for CI, including self-hosted and hosted execution modes with the same checks API.</li>
			<li>Release attestations, signed artifact verification, and more visible trust metadata on public release pages.</li>
			<li>Richer Git interop for importing history, exporting snapshots, and bridging existing deployment systems during migration.</li>
		</ul>
	</section>
</DocsPage>
