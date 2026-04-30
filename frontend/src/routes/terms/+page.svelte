<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';

	const sections = [
		{
			title: 'Overview',
			body: 'sty is a hosted collaboration service for PIG projects operated by Lantharos. These terms describe the rules for using the service, including the web app, CLI access, APIs, OAuth apps, webhooks, releases, and project collaboration features.'
		},
		{
			title: 'Using sty',
			body: 'You need an account to create projects, sync code, manage collaborators, create API keys, approve OAuth apps, publish releases, or use other signed-in features. You may browse public project surfaces without signing in when those routes are available.'
		},
		{
			title: 'Accounts and responsibility',
			body: 'Keep your account, local machines, tokens, signing keys, API keys, and webhook secrets secure. Activity from your account, credentials, integrations, or approved CLI sessions may be treated as your activity. Tell us if you believe access to your account or credentials has been compromised.'
		},
		{
			title: 'Projects and content',
			body: 'You keep ownership of the code, releases, issues, comments, artifacts, and other content you put into sty. You give sty the permission needed to host, process, display, sync, cache, back up, and deliver that content as part of the service.'
		},
		{
			title: 'Public and private projects',
			body: 'New projects are private by default. If you make a project public, anyone may read public project surfaces. Maintainers can also make release metadata and artifacts public while keeping the rest of a project private, and they are responsible for what they choose to publish.'
		},
		{
			title: 'Collaborators and permissions',
			body: 'Tenant and project roles decide who can read, write, maintain, administer, archive, delete, or configure automation. Only grant access to people and tools you trust. Removing access may not remove copies that collaborators already made while they had permission.'
		},
		{
			title: 'Signing and approvals',
			body: 'sty can use signing keys and browser approval flows to protect sensitive CLI actions. You are responsible for registering keys you control, reviewing approval prompts before accepting them, and revoking keys or sessions that should no longer be trusted.'
		},
		{
			title: 'Acceptable use',
			body: 'Do not use sty to attack systems, distribute malware, evade access controls, harass people, violate rights, overload the service, attempt credential theft, or store content you do not have the right to use. Do not use automation to degrade the service for other users.'
		},
		{
			title: 'Integrations and automation',
			body: 'You are responsible for integrations you create or approve. API keys, OAuth apps, and webhooks should request the smallest useful scope and be revoked when no longer needed. You are responsible for the behavior of tools acting with credentials you control.'
		},
		{
			title: 'APIs and rate limits',
			body: 'sty may enforce limits to keep the service stable, including request limits, storage limits, artifact limits, webhook retry limits, and abuse controls. You may not bypass access checks, scrape private data, or use the API in a way that harms reliability.'
		},
		{
			title: 'Releases and artifacts',
			body: 'Release notes, source snapshots, and artifacts should only include material you have the right to publish. Public release artifacts may be cached and downloaded by people who do not otherwise have project access.'
		},
		{
			title: 'Availability and changes',
			body: 'sty may change as the product evolves. Features can be added, changed, limited, or removed, especially before a stable public release. We may perform maintenance, change infrastructure, or limit functionality to protect users and keep the service running.'
		},
		{
			title: 'Suspension and termination',
			body: 'Access may be limited or removed when needed to protect sty, users, infrastructure, or legal rights. You may stop using sty and delete projects you control. Some records may remain where needed for backups, security, abuse prevention, or legal obligations.'
		},
		{
			title: 'Third-party services',
			body: 'sty may integrate with authentication providers, hosting infrastructure, deployment tools, webhooks, package managers, or other third-party services. Those services may have their own terms and policies, and sty is not responsible for systems outside our control.'
		},
		{
			title: 'Beta features',
			body: 'Some sty features may be experimental, limited, or unfinished. Beta features may change quickly and should not be treated as a long-term contract until they are documented as stable.'
		},
		{
			title: 'Warranty and liability',
			body: 'sty is provided as-is to the extent allowed by law. We are not responsible for lost profits, lost data, indirect damages, or issues caused by external integrations, local machines, credentials outside our control, or content published by users.'
		},
		{
			title: 'Changes to these terms',
			body: 'We may update these terms as sty changes. If a change materially affects how you use sty, we will make the updated terms available in the product.'
		}
	];
</script>

<svelte:head>
	<title>Terms of Service - sty</title>
	<meta name="description" content="The Lantharos terms for using sty project collaboration." />
</svelte:head>

<LegalPage
	title="Terms of Service"
	description="These terms describe the rules for using sty as a hosted PIG project collaboration service."
	effective="May 1, 2026"
>
	{#each sections as section}
		<section>
			<h2 class="text-lg font-semibold text-[#eae9e4]">{section.title}</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">{section.body}</p>
		</section>
	{/each}
</LegalPage>
