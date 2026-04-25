<script lang="ts">
	import { onMount } from 'svelte';
	import { createProject, listProjects, type ProjectSummary } from '$lib/api';
	import { hydrateSession, sessionStore, signOut, startLogin } from '$lib/session';

	let status = $state<'loading' | 'signedOut' | 'signedIn'>('loading');
	let projects = $state<ProjectSummary[]>([]);
	let slug = $state('');
	let message = $state('');
	let busy = $state(false);

	onMount(() => {
		const unsubscribe = sessionStore.subscribe((state) => {
			status = state.status;
		});
		hydrateSession()
			.then(refreshProjects)
			.catch((error) => {
				message = error instanceof Error ? error.message : 'Could not load session';
			});
		return unsubscribe;
	});

	async function refreshProjects() {
		if (status === 'signedOut') {
			projects = [];
			return;
		}
		projects = await listProjects();
	}

	async function handleCreate() {
		if (!slug.includes('/')) {
			message = 'Use tenant/project';
			return;
		}
		busy = true;
		message = '';
		try {
			await createProject(slug.trim());
			slug = '';
			await refreshProjects();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Project create failed';
		} finally {
			busy = false;
		}
	}

	async function handleSignOut() {
		await signOut();
		projects = [];
	}
</script>

<svelte:head>
	<title>sty</title>
</svelte:head>

<main class="min-h-screen bg-[#f6f5ef] text-[#171714]">
	<section class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
		<header class="flex items-center justify-between gap-6">
			<div>
				<h1 class="text-3xl font-semibold leading-tight">sty</h1>
				<p class="mt-1 text-sm text-[#6f6b5f]">Projects hosted for PIG workspaces.</p>
			</div>
			{#if status === 'signedIn'}
				<button
					class="bg-[#171714] px-4 py-2 text-sm font-medium text-[#f6f5ef] transition hover:bg-[#353226]"
					onclick={handleSignOut}
				>
					Sign out
				</button>
			{/if}
		</header>

		{#if status === 'signedOut'}
			<div class="grid flex-1 place-items-center">
				<div class="w-full max-w-xl">
					<h2 class="text-5xl font-semibold leading-none">Sign in to manage projects.</h2>
					<p class="mt-5 max-w-md text-base leading-7 text-[#5c584e]">
						Create a remote, connect it with the CLI, and keep PIG sync moving through sty.
					</p>
					<button
						class="mt-8 bg-[#171714] px-5 py-3 text-sm font-medium text-[#f6f5ef] transition hover:bg-[#353226]"
						onclick={startLogin}
					>
						Sign in with Ave
					</button>
				</div>
			</div>
		{:else}
			<div class="mt-12 grid gap-10 lg:grid-cols-[360px_1fr]">
				<section class="bg-[#eceadf] p-5">
					<h2 class="text-lg font-semibold">Create project</h2>
					<p class="mt-2 text-sm leading-6 text-[#6f6b5f]">Use the same tenant/project name PIG stores as its remote.</p>
					<div class="mt-6 flex gap-3">
						<input
							class="min-w-0 flex-1 bg-[#f8f7f1] px-3 py-3 text-sm text-[#171714] outline-none placeholder:text-[#918c7f]"
							placeholder="dev/demo"
							bind:value={slug}
							disabled={busy}
						/>
						<button
							class="bg-[#171714] px-4 py-3 text-sm font-medium text-[#f6f5ef] transition hover:bg-[#353226] disabled:opacity-50"
							disabled={busy}
							onclick={handleCreate}
						>
							Create
						</button>
					</div>
					{#if message}
						<p class="mt-4 text-sm leading-6 text-[#8c3e2f]">{message}</p>
					{/if}
				</section>

				<section>
					<div class="flex items-center justify-between gap-6">
						<div>
							<h2 class="text-lg font-semibold">Projects</h2>
							<p class="mt-2 text-sm text-[#6f6b5f]">{projects.length} configured</p>
						</div>
						<button
							class="bg-[#eceadf] px-4 py-2 text-sm font-medium text-[#171714] transition hover:bg-[#e1ded0]"
							onclick={refreshProjects}
						>
							Refresh
						</button>
					</div>

					<div class="mt-6 bg-[#eceadf]">
						{#if projects.length === 0}
							<p class="p-5 text-sm text-[#6f6b5f]">No projects yet.</p>
						{:else}
							<table class="w-full border-collapse text-left text-sm">
								<thead class="text-[#6f6b5f]">
									<tr>
										<th class="px-5 py-3 font-medium">Project</th>
										<th class="px-5 py-3 font-medium">Remote</th>
										<th class="px-5 py-3 font-medium">Owner</th>
									</tr>
								</thead>
								<tbody>
									{#each projects as project}
										<tr class="bg-[#f8f7f1]">
											<td class="px-5 py-4 font-medium">{project.project}</td>
											<td class="px-5 py-4 text-[#5c584e]">{project.tenant}/{project.project}</td>
											<td class="px-5 py-4 text-[#5c584e]">{project.owner}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</div>
				</section>
			</div>
		{/if}
	</section>
</main>
