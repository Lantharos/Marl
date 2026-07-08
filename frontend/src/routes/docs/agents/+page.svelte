<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const llms = `curl "$STY_FRONTEND_ORIGIN/docs/llms.txt"`;

	const ciCheck = `POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/checks
Authorization: Bearer <project-api-key>
Content-Type: application/json

{
  "name": "test",
  "status": "success",
  "target_url": "https://ci.example.com/runs/8721"
}`;
</script>

<svelte:head>
	<title>Agent Guide - sty docs</title>
	<meta name="description" content="Compact rules for agents working with PIG and sty, including auth boundaries, saves, API keys, checks, and docs discovery." />
</svelte:head>

<DocsPage
	title="Agent guide"
	description="Use this as the short operating contract for coding agents, CI tools, release bots, and hosted integrations that interact with PIG or sty."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Rules</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Use PIG for local code history. Use sty for identity, hosted review, permissions, releases, and automation.</li>
			<li>Do not create or replace human auth unless the human explicitly requested that action.</li>
			<li>Prefer project API keys or OAuth-issued project tokens for automation.</li>
			<li>Use <code>--json</code> for CLI output that a program needs to parse.</li>
			<li>Save at meaningful boundaries, pack before review, and sync only when the workspace is ready to share.</li>
			<li>Use runner tokens for self-hosted CI. Runners advertise labels, wait for wakeups when available, claim compatible queued jobs, execute commands outside sty, upload batched logs and artifacts, and report results into workspace checks.</li>
		</ul>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Docs discovery</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">The agent index is intentionally plain text and mirrors the important command, scope, endpoint, and webhook references.</p>
		<div class="mt-4">
			<CodeBlock code={llms} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">CI and checks</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Project CI commands enqueue jobs for configured events such as workspace pushes, ready workspace heads, or component releases. <code>pig ci detect</code> can read existing workflow files, including workflow path filters, runner labels, and simple matrix variants, and <code>pig ci detect --push</code> merges those jobs into the configured project. The CI import panel also accepts GitHub workflow YAML and converts common workflow events, path filters, matrices, artifact/cache steps, and Cloudflare deploy steps into sty commands and reusable setup blocks. The hosted UI can detect components from package and Cargo manifests, then suggest build, test, and deploy commands from those components. Commands filtered out by changed paths or affected components are reported as skipped checks, and commands with runner labels wait for a matching self-hosted runner. Self-hosted runners use <code>pig ci run</code> with a runner token; <code>pig ci runner setup</code> validates the connection and prints runner setup commands. Runners wait on WebSocket wakeups when available, fall back to adaptive polling, receive configured env and selected project CI secrets, upload redacted logs and artifacts, and can restore or save configured caches. External systems can also report checks directly through the checks API.</p>
		<div class="mt-4">
			<CodeBlock code={ciCheck} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Recommended scopes</h2>
		<div class="mt-4 grid gap-3">
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Coding agent</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]"><code>workspaces:read</code>, <code>workspaces:create</code>, <code>workspaces:write</code>, <code>workspaces:ready</code>, <code>issues:read</code>, and <code>issues:write</code>.</p>
			</div>
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">CI reporter</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]"><code>workspaces:read</code> and <code>workspaces:write</code>, limited to check creation for the integration account or API key.</p>
			</div>
			<div class="border-l border-[#3a3a36] pl-4">
				<h3 class="text-sm font-medium text-[#f0eee4]">Release bot</h3>
				<p class="mt-1 text-sm leading-6 text-[#8c887e]"><code>releases:read</code>, <code>releases:write</code>, and the read scopes needed to fetch source or release metadata.</p>
			</div>
		</div>
	</section>
</DocsPage>
