<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const preflight = `pig auth status --json
pig remote show --json
pig status --json`;

	const saveLoop = `pig status --json
pig suggest-save --json
pig save "describe the completed unit" --json
pig op log --json`;

	const recovery = `pig op log --json
pig op undo <operation-id> --json
pig resolve <attempt-id> --json
pig resolve <attempt-id> <path> --reuse --json`;
</script>

<svelte:head>
	<title>PIG Agents and MCP - sty docs</title>
	<meta name="description" content="How agents should use PIG safely with JSON output, MCP tools, frequent saves, operation undo, and conflict reuse." />
</svelte:head>

<DocsPage
	title="Agents and MCP"
	description="Agents should treat PIG as the local source of truth, save aggressively, and use structured output for every operation they need to parse."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Before changing files</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Check whether the human already connected auth and a remote. Agents should not create accounts, initialize remotes, or change auth state unless the user asked for it.</p>
		<div class="mt-4">
			<CodeBlock code={preflight} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Save loop</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Create small saves at meaningful boundaries. Pack them later when the workspace is ready for review or sync.</p>
		<div class="mt-4">
			<CodeBlock code={saveLoop} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Recovery loop</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use the operation log for VCS metadata mistakes, normal undo for content snapshots, and conflict reuse when a merge conflict shape has already been resolved before.</p>
		<div class="mt-4">
			<CodeBlock code={recovery} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">MCP tools</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Local work</h3>
				<p class="text-sm leading-6 text-[#8c887e]"><code>status</code>, <code>diff</code>, <code>save</code>, <code>pack</code>, <code>log</code>, <code>stack</code>, <code>query</code>, and <code>suggest_save</code>.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Source files</h3>
				<p class="text-sm leading-6 text-[#8c887e]"><code>source_list</code>, <code>source_read</code>, <code>source_write</code>, <code>source_delete</code>, and <code>source_move</code> for validated source access through PIG. Runtime env files stay in the environment tools.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Workspaces</h3>
				<p class="text-sm leading-6 text-[#8c887e]"><code>work_new</code>, <code>work_new_isolated</code>, <code>work_open_view</code>, <code>work_switch</code>, <code>work_move</code>, <code>work_ready</code>, <code>work_merge</code>, <code>work_list</code>, and <code>work_status</code>.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Recovery</h3>
				<p class="text-sm leading-6 text-[#8c887e]"><code>undo</code>, <code>op_log</code>, <code>op_undo</code>, <code>stash</code>, <code>unstash</code>, <code>stash_list</code>, <code>merge_attempt</code>, and <code>resolve</code>.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Environment</h3>
				<p class="text-sm leading-6 text-[#8c887e]"><code>env_list</code>, <code>env_set</code>, <code>env_get</code>, and <code>env_import</code> for values that should stay outside source snapshots.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[180px_1fr]">
				<h3 class="text-sm font-medium text-[#f0eee4]">Remote work</h3>
				<p class="text-sm leading-6 text-[#8c887e]"><code>sync</code> and <code>fetch_path</code> for object transfer and targeted remote reads.</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Attribution</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Automation can set <code>PIG_AGENT</code> and <code>PIG_AGENT_MODEL</code> so saves and history entries carry useful authorship metadata. Human users should still own browser approvals, account tokens, and permission changes.</p>
	</section>
</DocsPage>
