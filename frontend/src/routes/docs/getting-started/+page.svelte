<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import CommandList from '$lib/components/docs/CommandList.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { styCommandGroups } from '$lib/docs/commands';
	import { unixInstallCommand, windowsInstallCommand } from '$lib/install';

	const install = `# macOS / Linux
${unixInstallCommand}

# Windows
${windowsInstallCommand}

sty --help
pig --help`;

	const firstProject = `sty login
sty tenant new --name acme
sty init
pig save "initial import"
pig sync`;

	const forkProject = `sty fork lantharos/example
pig save "my change"
pig sync
sty sendwork`;

	const readOnlyClone = `sty clone lantharos/example ./example
sty clone lantharos/example ./parser-only --include src/parser`;

	const daily = `pig status
pig work new feature-name
pig save "describe the change"
pig work ready
pig sync`;
</script>

<svelte:head>
	<title>Getting Started - sty docs</title>
	<meta name="description" content="Install sty, sign in, create a tenant, initialize a project, and sync with PIG." />
</svelte:head>

<DocsPage
	title="Getting started"
	description="Use this when you have a repository and want it on sty. The hosted service already exists; your setup is just the CLI and the project connection."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">What you install</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Run the installer and choose both tools when you want hosted account/project setup. Choose just <code>pig</code> when you only want version-control work inside a repository.</p>
		<div class="mt-4">
			<CodeBlock code={install} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Connect a repository</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Run this from the repository you want to host. Your account already has a tenant named by your handle; create an organization tenant only when the project should live in a shared namespace. The init command asks for the tenant and project name; use <code>sty init --tenant acme --project website</code> when prompts are not available. Add <code>--folder product</code> when separate repositories belong together.</p>
		<div class="mt-4">
			<CodeBlock code={firstProject} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Fork a public project</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Forks can stay linked for a contribution or become independent copies in your tenant. Linked forks keep the parent hidden from your workspace until you send the work back.</p>
		<div class="mt-4">
			<CodeBlock code={forkProject} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Clone without connecting a remote</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use <code>sty clone</code> when you only need files. Add <code>--include</code> to download one file or directory through the path-closure API instead of pulling the whole tree.</p>
		<div class="mt-4">
			<CodeBlock code={readOnlyClone} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Work after setup</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Once the remote is configured, most of your time is in PIG. Import local runtime values with <code>pig env import .env</code> instead of saving them. Save whenever work reaches a meaningful point, or run <code>pig watch</code> while an agent edits. Pack before work becomes shared, mark a workspace ready when it should be reviewed, then sync.</p>
		<div class="mt-4">
			<CodeBlock code={daily} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Words you will see</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Tenant</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A namespace. It can be your handle or an organization you create.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Project</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A hosted PIG repository under a tenant. New projects are private by default.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Folder</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A tenant-level grouping for related projects, useful when a mobile app, website, and service live in separate repositories. Tenant maintainers can create nested folders and move projects between them from the tenant home.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Workspace</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A named line of work. Use isolated workspaces when multiple agents or features need separate folders.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Fork</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A copy of a public project in your tenant. Contribution forks remember the parent so <code>sty sendwork</code> can publish your workspace back for review.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[150px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Save and pack</h3>
				<p class="text-sm leading-6 text-[#8c887e]">A save is a local snapshot. A pack turns noisy local saves into one shareable checkpoint.</p>
			</div>
		</div>
	</section>

	<CommandList groups={styCommandGroups} />
</DocsPage>
