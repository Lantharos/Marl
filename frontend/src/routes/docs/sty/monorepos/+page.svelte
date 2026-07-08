<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const componentSettings = `{
  "components": [
    {
      "id": "sty-web",
      "name": "Sty web",
      "paths": ["apps/web", "packages/ui"],
      "depends_on": ["packages-ui"],
      "owners": ["frontend"],
      "build_command": "bun run build:web",
      "test_command": "bun run check",
      "deploy_targets": ["production"],
      "release_policy": "independent",
      "version_policy": "independent",
      "require_owner_approval": true
    },
    {
      "id": "pig",
      "name": "PIG",
      "paths": ["crates/pig"],
      "owners": ["core"],
      "test_command": "cargo test -p pig",
      "release_policy": "independent"
    }
  ]
}`;

	const ciCommand = `{
  "ci": {
    "enabled": true,
    "blocks": [
      {
        "name": "web setup",
        "run": "bun install --frozen-lockfile",
        "cache": [{ "key": "bun-cache", "path": ".bun/install/cache" }]
      }
    ],
    "commands": [
      {
        "name": "web / check",
        "uses_blocks": ["web setup"],
        "run": "bun run check",
        "events": ["workspace.push", "workspace.ready"],
        "components": ["sty-web"],
        "matrix": [{ "key": "node", "values": ["20", "22"] }],
        "artifacts": ["apps/web/dist"],
        "cache": [{ "key": "bun-cache", "path": ".bun/install/cache" }]
      },
      {
        "name": "web / deploy",
        "run": "bunx wrangler deploy --env production",
        "events": ["release.created"],
        "components": ["sty-web"],
        "secrets": ["CLOUDFLARE_API_TOKEN"]
      }
    ]
  }
}`;

	const release = `POST /v1/tenants/:tenant/projects/:project/releases
Authorization: Bearer <maintainer-token>
Content-Type: application/json

{
  "tag": "v0.8.0",
  "name": "Sty web v0.8.0",
  "components": ["sty-web"],
  "latest": true,
  "notes": "Changes for the web component"
}`;
</script>

<svelte:head>
	<title>Monorepos - sty docs</title>
	<meta name="description" content="Use components for monorepo issue routing, independent releases, deployment lanes, and affected CI in sty." />
</svelte:head>

<DocsPage
	title="Monorepos"
	description="A sty project is one codebase and one history. Components are first-class slices inside that project, so teams can route issues, releases, deployments, and CI without splitting the repository."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Project and component model</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Keep cross-cutting work in one project. Add components for owned paths such as apps, packages, crates, services, or docs. Issues can point at components, releases can target components, and CI can run only for affected components. Component settings can detect packages and crates from <code>package.json</code>, <code>pnpm-workspace.yaml</code>, and <code>Cargo.toml</code> files in the main workspace, including internal dependencies where they are visible from manifests.</p>
		<div class="mt-4">
			<CodeBlock code={componentSettings} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Component dashboard</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">The Components tab is the monorepo dashboard. It shows each visible component with owners, paths, dependencies, open issues, latest component release, recent CI state, and recent component-touched history.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Independent releases</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">A release with no components is project-scoped. A release with components is tracked in that component lane. The same tag can exist in different component lanes, and <code>latest</code> is cleared only inside the same lane.</p>
		<div class="mt-4">
			<CodeBlock code={release} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Affected CI</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">CI commands can filter by event, workspace, changed paths, affected components, and runner labels. On workspace pushes and ready workspace heads, sty compares the head with the snapshot parent and derives affected components from component paths. Commands scoped to untouched components are skipped instead of queued. Matrices expand one command into named jobs and expose each axis as <code>MATRIX_*</code> env.</p>
		<div class="mt-4">
			<CodeBlock code={ciCommand} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Workflow import</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">The CI import panel accepts either sty JSON or GitHub workflow YAML. It reads workflow events, path filters, runner labels, job env, simple strategy matrices, run steps, artifact uploads, cache steps, and common Cloudflare wrangler actions. Repeated setup steps are turned into reusable sty CI blocks so commands do not have to duplicate install/cache work. The CI Suggest action reads the same manifest information as component detection and adds build, test, and Cloudflare deploy commands for detected components without replacing existing commands.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Cloudflare deploys</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Cloudflare deploy jobs are normal sty CI commands. For Workers use <code>wrangler deploy</code>. For Pages use <code>wrangler pages deploy</code> with the built output and project name. Store Cloudflare tokens as CI secrets and list only the secrets that command needs.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Runner permissions</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Self-hosted runners use runner tokens, not maintainer API keys. A runner can claim compatible jobs, receive selected env and CI secrets, upload logs, upload job artifacts, restore or save caches, and complete the job. It cannot change project settings, issues, releases, or source history unless a maintainer gives another token to the command.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Owner approval</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Components can require owner approval. When a ready workspace touches that component, merge is blocked until a current approval comes from one of the component owners. The workspace page shows the exact missing owner approval requirement with the other merge blockers.</p>
	</section>
</DocsPage>
