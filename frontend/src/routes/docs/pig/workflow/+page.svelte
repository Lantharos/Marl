<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';

	const humanLoop = `pig status
pig save "describe the change"
pig work new feature-name
pig save "finish first pass"
pig pack
pig work ready
pig sync`;

	const agentLoop = `pig status --json
pig save "small completed unit"
pig diff --stat
pig query "recent auth changes" --json
pig pack
pig sync --json`;

	const recover = `pig undo
pig undo --session
pig op log
pig op undo
pig stash "hold local edits"
pig unstash`;
</script>

<svelte:head>
	<title>PIG Daily Workflow - sty docs</title>
	<meta name="description" content="Recommended PIG workflow for humans and agents: save often, pack before sharing, undo safely, and sync when ready." />
</svelte:head>

<DocsPage
	title="daily workflow"
	description="Save aggressively while work is cheap and local. Pack when it should become understandable to another person."
>
	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Human workflow</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use readable commands, inspect the stack, and let <code>work ready</code> offer to pack noisy saves before review.</p>
		</div>
		<CodeBlock code={humanLoop} />
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Agent workflow</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">Agents should use <code>--json</code>, save after meaningful units, query local history before repeating work, and pack before handing off.</p>
		</div>
		<CodeBlock code={agentLoop} />
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Recovery workflow</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">Use content undo when you want a new restore snapshot. Use operation undo when a VCS action changed local metadata or history and you want to roll that action back.</p>
		</div>
		<CodeBlock code={recover} />
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">When to pack</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Pack before marking a workspace ready when the local stack has several exploratory saves.</li>
			<li>Use <code>pig pack 3</code> when only the last three saves belong together.</li>
			<li>Use <code>pig pack 4..10</code> when older saves should become one readable snapshot while the latest saves stay separate.</li>
			<li>Use <code>pig unpack</code> to undo the latest pack operation before sharing.</li>
			<li>Use <code>pig pack --force</code> only when rewriting already-synced local history is intentional. Follow with <code>pig sync --force</code> when the remote should be replaced too.</li>
		</ul>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Multirepo folders</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">When the current folder contains top-level child repositories and the root itself has no configured remote, <code>pig status</code>, <code>pig save</code>, <code>pig diff</code>, and <code>pig sync</code> operate on those child repositories. PIG only checks immediate children and caches the repo list. Run <code>pig repos refresh</code> after adding or removing a child repo.</p>
	</section>
</DocsPage>
