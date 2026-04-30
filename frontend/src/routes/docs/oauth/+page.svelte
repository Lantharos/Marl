<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { oauthTokenJson } from '$lib/docs/protocol';

	const authorizeUrl = `/oauth/authorize?client_id=app_123
  &redirect_uri=https%3A%2F%2Fdeploy.example.com%2Fsty%2Fcallback
  &tenant=acme
  &project=website
  &scope=main%3Aread%20workspaces%3Aread%20webhooks%3Awrite`;

	const tokenResponse = `{
  "access_token": "sty_project_...",
  "token_type": "Bearer",
  "expires_at": null,
  "scope": "main:read workspaces:read webhooks:write",
  "tenant": "acme",
  "project": "website",
  "integration_id": "int_..."
}`;
</script>

<svelte:head>
	<title>OAuth - sty docs</title>
	<meta name="description" content="Developer app authorization flow for sty project integrations." />
</svelte:head>

<DocsPage
	title="OAuth apps"
	description="OAuth apps let another product ask a maintainer to connect one sty project. Approval creates a project-scoped token with granular scopes, not an account-wide token."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Create an app</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Create developer apps in User Settings. sty returns a client id and a one-time client secret. Store the secret in the integration backend, not the browser.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Send the user to sty</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">The public browser route is <code>/oauth/authorize</code>. The signed-in maintainer reviews the app, project, and scopes. The frontend then calls <code>POST /v1/oauth/authorize</code> and redirects back to your app with a code.</p>
		<div class="mt-4">
			<CodeBlock code={authorizeUrl} />
		</div>
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Exchange the code</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">Your backend exchanges the code at <code>POST /v1/oauth/token</code>. Both <code>grant_type</code> and <code>grantType</code> are accepted, but new clients should send <code>grant_type</code>.</p>
		</div>
		<CodeBlock code={oauthTokenJson} />
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Token response</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">The returned bearer token behaves like a project API key with the approved scopes. It can be revoked from the project's Automation settings.</p>
		</div>
		<CodeBlock code={tokenResponse} />
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Rules</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Only a project maintainer can approve an OAuth app.</li>
			<li>Approval is for one tenant/project pair.</li>
			<li>Request only the scopes your app needs.</li>
			<li>Use webhooks for event delivery instead of polling project state.</li>
		</ul>
	</section>
</DocsPage>
