<script lang="ts">
	import CommandList from '$lib/components/docs/CommandList.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { styCommandGroups } from '$lib/docs/commands';
</script>

<svelte:head>
	<title>sty CLI - sty docs</title>
	<meta name="description" content="sty CLI commands for login, init, clone, fork, sendwork, collaborators, tenants, projects, and leaves." />
</svelte:head>

<DocsPage
	title="sty CLI"
	description="Use the sty CLI for account and project operations. Use PIG for repository saves, workspaces, local history, and sync once the project is connected."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Command shape</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Most commands accept <code>--remote-url</code> for non-default deployments. Commands that call PIG accept <code>--pig</code> so scripts can point at a specific binary.</p>
	</section>

	<CommandList groups={styCommandGroups} />
</DocsPage>
