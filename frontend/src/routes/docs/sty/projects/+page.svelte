<script lang="ts">
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
</script>

<svelte:head>
	<title>Projects and Access - sty docs</title>
	<meta name="description" content="Tenants, project folders, collaborators, roles, visibility, archived projects, and workspace privacy in sty." />
</svelte:head>

<DocsPage
	title="projects and access"
	description="sty uses tenant/project names, inherited collaborator roles, project-specific roles, and workspace visibility to keep code sharing explicit."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Tenants and folders</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Every user has an account tenant named by their public handle. Organization tenants are created with <code>sty tenant new</code>. Project folders are tenant metadata; they group separate repositories without changing the remote name each repo uses.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Roles</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Owner</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Implicit controller of a tenant or project. This role is not assignable.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Maintainer</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Manages settings, collaborators, releases, API keys, webhooks, OAuth integrations, merge rules, and ready merges.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Contributor</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Can sync code, create feature workspaces, open issues and comments, mark work ready, and do normal project work.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Viewer</h3>
				<p class="text-sm leading-6 text-[#8c887e]">Can read private project data without write access.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Visibility</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Projects are private by default. Public projects are visible in discovery and can be forked.</li>
			<li>Workspace visibility is separate from project visibility. A team can keep a security patch workspace private or team-only until it is ready.</li>
			<li>Private projects can publish release artifacts without making code browsing, issues, history, or workspaces public.</li>
			<li>Archived projects stay readable to users who already had access, but project mutations are blocked until a maintainer unarchives the project.</li>
		</ul>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">API keys and OAuth apps</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Project API keys and OAuth-issued tokens are project-scoped. Their permissions are named scopes, so an agent can work in feature workspaces without gaining permission to advance <code>main</code>.</p>
	</section>
</DocsPage>
