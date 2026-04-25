<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { listIssues, createIssue, type Issue } from '$lib/api';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let issues = $state<Issue[]>([]);
	let loading = $state(true);
	let error = $state('');
	let showForm = $state(false);
	let title = $state('');
	let body = $state('');
	let busy = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			const data = await listIssues(tenant, project);
			issues = data.issues;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project) load();
	});

	async function handleCreate() {
		if (!title.trim()) return;
		busy = true;
		try {
			await createIssue(tenant, project, { title: title.trim(), body: body.trim() });
			title = '';
			body = '';
			showForm = false;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-sm font-semibold text-[#f0eee4]">Issues <span class="ml-1 text-[#6f6b5f]">({issues.length})</span></h3>
		<button
			class="rounded bg-[#2a2a28] px-3 py-1.5 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]"
			onclick={() => (showForm = !showForm)}
		>
			New issue
		</button>
	</div>

	{#if showForm}
		<div class="mb-4 rounded border border-[#2a2a28] bg-[#141412] p-4">
			<div class="grid gap-3">
				<input class="rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Title" bind:value={title} />
				<textarea class="min-h-[80px] resize-y rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Description" bind:value={body}></textarea>
				<div class="flex justify-end gap-2">
					<button class="px-3 py-1.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (showForm = false)}>Cancel</button>
					<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d]" disabled={busy || !title.trim()} onclick={handleCreate}>Create</button>
				</div>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<div class="grid gap-1">
			{#each issues as issue}
				<button
					class="flex items-start gap-3 rounded border border-[#2a2a28] bg-[#141412] px-4 py-3 text-left hover:border-[#3a3a36]"
					onclick={() => goto(`/${tenant}/${project}/issues/${issue.id}`)}
				>
					<span class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full {issue.status === 'open' ? 'bg-[#7cb97c]' : 'bg-[#d96c5a]'}"></span>
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium text-[#eae9e4]">{issue.title}</div>
						<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
							<span>#{issue.number}</span>
							<span>{issue.status}</span>
							<span>by {issue.author}</span>
							<span>{new Date(issue.created_at).toLocaleDateString()}</span>
						</div>
						{#if issue.labels.length}
							<div class="mt-1.5 flex flex-wrap gap-1">
								{#each issue.labels as label}
									<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#a09d94]">{label}</span>
								{/each}
							</div>
						{/if}
					</div>
				</button>
			{:else}
				<p class="py-8 text-center text-sm text-[#6f6b5f]">No issues yet.</p>
			{/each}
		</div>
	{/if}
</div>
