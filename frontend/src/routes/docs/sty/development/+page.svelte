<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const workerLocal = `cd sty/server
bunx wrangler d1 migrations apply sty-db --local
bunx wrangler dev`;

	const workerRemote = `cd sty/server
bunx wrangler queues create sty-webhooks
bunx wrangler queues create sty-webhooks-dlq
bunx wrangler queues create sty-ci
bunx wrangler queues create sty-ci-dlq
bunx wrangler d1 migrations apply sty-db --remote
bunx wrangler deploy --dry-run
bunx wrangler deploy`;

	const frontend = `cd sty/frontend
bun install
bun run dev`;

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
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">The default frontend API base points at the local Worker. Set <code>PUBLIC_STY_API_BASE</code> only when using a different API origin.</p>
		</div>
		<CodeBlock code={frontend} />
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
