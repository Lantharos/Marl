<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';

	const sections = [
		{
			title: 'Overview',
			body: 'sty is a hosted service for PIG projects, workspaces, issues, releases, and automation. Lantharos operates sty. This policy explains the information needed to run the service and how that information is handled.'
		},
		{
			title: 'What sty collects',
			body: 'sty stores account details needed to identify you in the product, such as your handle, display name, avatar, email when provided by sign-in, session metadata, and security-related records. We also store preferences and settings that make the signed-in experience work across the web app and CLI.'
		},
		{
			title: 'Project content',
			body: 'When you use sty, we store the project data you choose to send: PIG objects, workspace heads, save history, issues, comments, labels, milestones, releases, artifacts, settings, collaborators, API keys, webhooks, and integration records. Private project content is treated as private unless you change visibility or publish a public release surface.'
		},
		{
			title: 'Usage and diagnostics',
			body: 'We may keep operational logs, request metadata, error reports, abuse signals, performance measurements, and security events so sty can stay reliable, secure, and debuggable. We use this information to understand failures, stop misuse, and improve the service without turning your activity into a public social profile.'
		},
		{
			title: 'CLI and local data',
			body: 'The PIG and sty command-line tools may keep local configuration, sessions, signing metadata, and repository data on your machine. Local files remain your responsibility. When the CLI talks to sty, it sends the information needed for the command you ran, such as sync objects, account checks, approval requests, or signing key registration.'
		},
		{
			title: 'How sty uses data',
			body: 'We use data to authenticate you, host projects, enforce permissions, sync PIG repositories, deliver webhooks, show releases and issues, send project notifications, prevent abuse, investigate security problems, and improve reliability. We do not sell private project content.'
		},
		{
			title: 'Visibility and sharing',
			body: 'Project data is visible according to project visibility and collaborator permissions. Public projects can be read by anyone. Private projects require access, except when maintainers explicitly make release metadata or artifacts public for things like updaters and download flows.'
		},
		{
			title: 'Collaborators',
			body: 'When you add collaborators or grant tenant access, those people may see the project or tenant data allowed by their role. Their actions may create visible records such as saves, comments, issue changes, release uploads, and settings changes.'
		},
		{
			title: 'Integrations',
			body: 'API keys, OAuth apps, and webhooks can send project data to tools you configure. Integration scopes are meant to be specific, but you should still treat approved tools as part of your workspace and revoke access when you no longer need it.'
		},
		{
			title: 'Cookies and browser storage',
			body: 'sty uses browser storage and related session mechanisms to keep you signed in, remember product state, and protect sensitive browser approval flows. We do not use these surfaces to build advertising profiles.'
		},
		{
			title: 'Security',
			body: 'sty uses scoped tokens, collaborator roles, browser approval for sensitive CLI actions, project-level access checks, and signing key records to protect projects. You are responsible for keeping local machines, tokens, API keys, signing keys, and webhook secrets safe.'
		},
		{
			title: 'Retention',
			body: 'We keep account and project data while it is needed to provide sty, meet security needs, resolve disputes, or comply with obligations. Project deletion removes the project from normal product access, though some records may remain briefly in backups, logs, or abuse-prevention systems.'
		},
		{
			title: 'Deletion and export',
			body: 'You can delete projects you control, remove collaborators, revoke sessions, delete API keys, remove webhooks, disconnect integrations, change project visibility, and archive projects. You can also use PIG locally to keep your own repository state outside sty.'
		},
		{
			title: 'Service providers',
			body: 'sty may rely on infrastructure, authentication, storage, delivery, security, and observability providers to operate the service. Those providers process information for sty so the product can run; they are not allowed to use private project content for their own unrelated purposes.'
		},
		{
			title: 'Changes to this policy',
			body: 'We may update this policy as sty changes. If a change materially affects how project or account data is handled, we will make the updated policy available in the product.'
		}
	];
</script>

<svelte:head>
	<title>Privacy Policy - sty</title>
	<meta name="description" content="The sty privacy policy explains what data Lantharos stores for sty and how project data is handled." />
</svelte:head>

<LegalPage
	title="Privacy Policy"
	description="This policy explains what sty stores and how that data is used to provide hosted PIG project collaboration."
	effective="May 1, 2026"
>
	{#each sections as section}
		<section>
			<h2 class="text-lg font-semibold text-[#eae9e4]">{section.title}</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">{section.body}</p>
		</section>
	{/each}
</LegalPage>
