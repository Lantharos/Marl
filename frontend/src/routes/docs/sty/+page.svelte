<script lang="ts">
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
</script>

<svelte:head>
	<title>sty Overview - sty docs</title>
	<meta name="description" content="What sty provides on top of PIG: hosting, identity, review, permissions, releases, and automation." />
</svelte:head>

<DocsPage
	title="sty overview"
	description="sty is the hosted collaboration layer for PIG projects. PIG owns the local version-control model; sty hosts the remote state people and tools collaborate around."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">What sty owns</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Identity</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Browser login, user profiles, account tenants, sessions, signing keys, SSH keys, and browser approvals for sensitive CLI actions.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Projects</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Hosted PIG remotes under <code>tenant/project</code>, with private-by-default visibility, folders, screenshots, public project pages, and archive controls.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Review</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Ready workspaces, comments on saves/files/lines, approvals, changes requested, status checks, merge rules, and notifications.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Automation</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Granular API keys, OAuth developer apps, webhooks, hooks, CI runners, release artifacts, and public release downloads for installers and updaters.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Protocol</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Object storage, workspace heads, history, compare, merge preview, path closure fetch, and capability negotiation for PIG-compatible clients.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">What sty does not hide</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">sty does not replace the local VCS. You can save, pack, undo, query history, merge local workspaces, and resolve conflicts before the server is involved. The hosted service adds shared identity, permissions, review, and remote storage.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Default model</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>New projects are private unless a maintainer makes them public.</li>
			<li>The <code>main</code> workspace is the public/default line inside a project. Feature work happens in named workspaces.</li>
			<li>Workspaces can be private, team-visible, or public, so security patches and early collaboration do not need to be exposed before they are ready.</li>
			<li>Public projects can be forked. Linked forks can send work back with <code>sty sendwork</code>.</li>
			<li>Project CI can queue jobs for ready workspaces. Self-hosted runners execute jobs outside sty and report results into checks.</li>
		</ul>
	</section>
</DocsPage>
