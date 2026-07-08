<script lang="ts">
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
</script>

<svelte:head>
	<title>Review Workflow - sty docs</title>
	<meta name="description" content="Ready workspaces, review comments, approvals, checks, merge rules, and notifications in sty." />
</svelte:head>

<DocsPage
	title="review workflow"
	description="Review in sty is workspace-native. A ready workspace is the review unit; comments, approvals, checks, and merge rules attach to that workspace and head."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">From local work to review</h2>
		<ol class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>1. Work locally in PIG and save frequently.</li>
			<li>2. Pack noisy saves into a readable checkpoint when the work should be reviewed.</li>
			<li>3. Run <code>pig work ready</code> and then <code>pig sync</code>.</li>
			<li>4. Reviewers open the workspace, inspect code/history/diffs, comment, approve, request changes, or merge.</li>
		</ol>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Comments and approvals</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Comments can target a workspace, history entry, file, line, or line range. Approvals and changes-requested reviews are tied to the ready workspace head, so changing the workspace can require fresh approval when the project rule demands current-head approval.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Status checks</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">sty stores status checks and can queue CI jobs for workspace pushes, ready workspace heads, or release events. Self-hosted runners wait for runner wakeups, claim jobs with project runner tokens, match command runner labels, execute commands in an isolated checkout, stop running commands when a job is canceled, upload batched logs and artifacts, restore or save file and directory caches, and report the result back to the workspace. CI commands can set env, request selected project secrets, and use event, workspace, path, and component filters. Path or component filters that do not match the changed files are marked skipped instead of queued. CI artifacts and caches are retained for the project CI retention window. External systems can still call the checks API directly.</p>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Merge rules</h2>
		<ul class="mt-3 grid gap-2 text-sm leading-6 text-[#8c887e]">
			<li>Require a minimum number of maintainer approvals.</li>
			<li>Require passing CI or externally reported status checks.</li>
			<li>Require approvals to apply to the current workspace head.</li>
			<li>Require approval from an owner of each touched component that has owner approval enabled.</li>
			<li>Block merge while file conversations are unresolved.</li>
			<li>Protect selected workspaces such as <code>main</code> from direct pushes.</li>
		</ul>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Notifications</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">The notifications inbox is for review and merge activity: ready work, mentions, assigned issues, rejected work, merged work, and release-oriented project movement.</p>
	</section>
</DocsPage>
