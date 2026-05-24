<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { endpointGroups, paginationJson } from '$lib/docs/protocol';

	const authExample = `curl -H "Authorization: Bearer $STY_TOKEN" \\
  "$STY_API_BASE/v1/me"`;

	const errorJson = `{
  "error": "project not found"
}`;
</script>

<svelte:head>
	<title>API - sty docs</title>
	<meta name="description" content="sty REST API endpoints, authentication, pagination, errors, and cache behavior." />
</svelte:head>

<DocsPage
	title="API"
	description="The sty API is a versioned REST surface at /v1. PIG uses it for remote sync, and external tools can use it with user sessions, project API keys, OAuth-issued project tokens, or CI runner tokens."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Base URL and auth</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use the sty API base configured by your CLI session or the hosted product origin for browser apps. Authenticated calls use a bearer token.</p>
		<div class="mt-4">
			<CodeBlock code={authExample} />
		</div>
	</section>

	<section class="grid gap-4 md:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Pagination</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">List endpoints accept <code>page</code>, <code>per_page</code>, and sometimes <code>all=true</code>. Clients should prefer paging over broad fetches.</p>
		</div>
		<CodeBlock code={paginationJson} />
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Session consistency</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">API responses may include <code>x-d1-bookmark</code>. Clients can send that value on later requests to continue from the same database session and keep reads consistent when database read replicas are enabled.</p>
	</section>

	<section class="grid gap-4 md:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Errors</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">Errors use normal HTTP status codes. Missing tenants and projects should be 404, permission failures 403, bad input 400, and compare conflicts 409.</p>
		</div>
		<CodeBlock code={errorJson} />
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Caching</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Immutable object reads are cacheable by object id. Code trees, files, stats, and overview responses use ETags tied to the relevant snapshot or project state. Private projects use private cache headers; public project reads can use shared cache headers when the response is safe to share.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Remote protocol</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">PIG clients use the same REST surface, but sync has stricter rules around capabilities, immutable objects, workspace heads, and history rewrites. See <a class="text-[#d9a66c] hover:text-[#e6bd86]" href="/docs/protocol">Remote protocol</a> for that contract.</p>
	</section>

	{#each endpointGroups as group (group.title)}
		<section>
			<h2 class="text-lg font-semibold text-[#eae9e4]">{group.title}</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">{group.note}</p>
			<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
				{#each group.endpoints as endpoint (endpoint)}
					<div class="border-b border-[#252522] px-4 py-2.5 text-sm text-[#d8d6cc] last:border-b-0">
						<code>{endpoint}</code>
					</div>
				{/each}
			</div>
		</section>
	{/each}
</DocsPage>
