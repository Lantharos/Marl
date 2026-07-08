<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const workerLocal = `cd sty/server
bunx wrangler d1 migrations apply <database-name> --local
bunx wrangler dev`;

	const workerRemote = `cd sty/server
# Create D1, R2, queues, and routes from wrangler.jsonc first
bunx wrangler d1 migrations apply <database-name> --remote
bunx wrangler deploy --dry-run
bunx wrangler deploy`;

	const frontend = `cd sty/frontend
bun install
bun run dev`;

	const frontendDeploy = `cd sty/frontend
bun install
bun run deploy`;

	const rustBuild = `cd sty
cargo build

cd ../pig
cargo build`;
</script>

<svelte:head>
	<title>Development - sty docs</title>
	<meta name="description" content="Run sty and PIG from source: Worker, frontend, migrations, Rust CLIs, and environment settings." />
</svelte:head>

<DocsPage
	title="development"
	description="Use this when you are working on sty itself. The backend is a Cloudflare Worker, the frontend is SvelteKit, and the CLIs are Rust."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Project layout</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<code class="text-sm text-[#d9a66c]">pig/</code>
				<p class="text-sm leading-6 text-[#8c887e]">The PIG Rust CLI, local repository model, MCP server, and Raycast extension.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<code class="text-sm text-[#d9a66c]">sty/client</code>
				<p class="text-sm leading-6 text-[#8c887e]">The sty Rust CLI.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<code class="text-sm text-[#d9a66c]">sty/server</code>
				<p class="text-sm leading-6 text-[#8c887e]">The Cloudflare Worker API using D1 for metadata and R2 for immutable objects, release artifacts, CI artifacts, and CI file caches.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<code class="text-sm text-[#d9a66c]">sty/frontend</code>
				<p class="text-sm leading-6 text-[#8c887e]">The SvelteKit dashboard and public docs.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[180px_1fr]">
				<code class="text-sm text-[#d9a66c]">sty/crates/sty-protocol</code>
				<p class="text-sm leading-6 text-[#8c887e]">Shared request and response types.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Run the Worker</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Apply migrations before using local or remote Cloudflare resources. Remote deploys also need the webhook and CI queues, their dead-letter queues, the object bucket, and the runner wakeup Durable Object migration.</p>
		<div class="mt-4 grid gap-4 lg:grid-cols-2">
			<CodeBlock label="Local" code={workerLocal} />
			<CodeBlock label="Remote" code={workerRemote} />
		</div>
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Run the frontend</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Production API base is <code>https://sty.sh/api</code>. For local development, run the worker with <code>bunx wrangler dev</code> and point the CLI or frontend at <code>http://127.0.0.1:8787/api</code>. Use <code>sty login --port 8787</code> instead of passing a full URL.</p>
		</div>
		<CodeBlock code={frontend} />
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Deploy the frontend</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">The SvelteKit app deploys as a separate worker on <code>sty.sh/*</code>. Deploy the API worker first so <code>/api</code> routes are live.</p>
		</div>
		<CodeBlock code={frontendDeploy} />
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Build the CLIs</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">The debug binaries are under each Cargo workspace target directory.</p>
		</div>
		<CodeBlock code={rustBuild} />
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Useful Worker settings</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li><code>STY_ALLOWED_ORIGINS</code>: comma-separated CORS allowlist.</li>
			<li><code>STY_FRONTEND_ORIGIN</code>: browser origin for OAuth callbacks and remote approval links.</li>
			<li><code>STY_TOKEN_TTL_SECONDS</code>: session token lifetime.</li>
			<li><code>STY_MAX_OBJECT_BYTES</code>: maximum raw object upload size.</li>
		</ul>
	</section>
</DocsPage>
