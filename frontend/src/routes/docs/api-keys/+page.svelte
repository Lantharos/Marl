<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { apiKeyCreateJson, apiScopes } from '$lib/docs/protocol';

	const createKey = `POST /v1/tenants/:tenant/projects/:project/api-keys
Authorization: Bearer <maintainer-token>
Content-Type: application/json`;
</script>

<svelte:head>
	<title>API Keys - sty docs</title>
	<meta name="description" content="Create granular project API keys for agents, release tooling, webhooks, and automation." />
</svelte:head>

<DocsPage
	title="API keys"
	description="API keys are project-scoped bearer tokens for non-human clients. They are granular on purpose, so an agent can work in feature workspaces without getting permission to advance main."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Create a key</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Only project maintainers can create keys. The secret token is returned once at creation time; later list calls only show the id, prefix, scopes, and timestamps.</p>
		<div class="mt-4 grid gap-4 lg:grid-cols-2">
			<CodeBlock code={createKey} />
			<CodeBlock code={apiKeyCreateJson} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Scopes</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			{#each apiScopes as scope}
				<div class="grid gap-2 border-b border-[#252522] px-4 py-3 last:border-b-0 md:grid-cols-[190px_1fr]">
					<code class="text-sm text-[#d9a66c]">{scope.scope}</code>
					<p class="text-sm leading-6 text-[#a09d94]">{scope.allows}</p>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Useful bundles</h2>
		<div class="mt-4 grid gap-3">
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Feature agent</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]"><code>workspaces:read</code>, <code>workspaces:create</code>, <code>workspaces:write</code>, <code>workspaces:ready</code>, <code>issues:read</code>, <code>issues:write</code>. This can create work and leave review comments without touching main.</p>
			</div>
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Release bot</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]"><code>releases:read</code>, <code>releases:write</code>, and optionally <code>webhooks:read</code>. This can publish artifacts without project settings access.</p>
			</div>
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Deployment integration</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]"><code>main:read</code>, <code>workspaces:read</code>, <code>releases:read</code>, <code>webhooks:write</code>. This can read source state and install a ship webhook.</p>
			</div>
		</div>
	</section>
</DocsPage>
