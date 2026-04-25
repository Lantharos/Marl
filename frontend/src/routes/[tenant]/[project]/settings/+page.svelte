<script lang="ts">
	import { page } from '$app/stores';
	import { getProjectSettings, updateProjectSettings, type ProjectSettings } from '$lib/api';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let settings = $state<ProjectSettings>({ visibility: 'private', starred_count: 0, is_starred: false, default_workspace: 'main' });
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			settings = await getProjectSettings(tenant, project);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project) load();
	});

	async function handleVisibilityChange(next: 'public' | 'private') {
		if (next === settings.visibility) return;
		busy = true;
		try {
			await updateProjectSettings(tenant, project, { visibility: next });
			settings = { ...settings, visibility: next };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-xl">
	<h3 class="mb-4 text-sm font-semibold text-[#f0eee4]">Settings</h3>

	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<div class="grid gap-4">
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<div class="text-sm font-medium text-[#eae9e4]">Visibility</div>
				<p class="mt-1 text-xs text-[#6f6b5f]">Control who can see this project.</p>
				<div class="mt-3 flex gap-2">
					<button
						class="rounded px-3 py-1.5 text-xs font-medium {settings.visibility === 'public' ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'bg-[#2a2a28] text-[#a09d94] hover:bg-[#3a3a36]'}"
						disabled={busy}
						onclick={() => handleVisibilityChange('public')}
					>
						Public
					</button>
					<button
						class="rounded px-3 py-1.5 text-xs font-medium {settings.visibility === 'private' ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'bg-[#2a2a28] text-[#a09d94] hover:bg-[#3a3a36]'}"
						disabled={busy}
						onclick={() => handleVisibilityChange('private')}
					>
						Private
					</button>
				</div>
			</div>

			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<div class="text-sm font-medium text-[#eae9e4]">Stars</div>
				<p class="mt-1 text-xs text-[#6f6b5f]">{settings.starred_count} stars</p>
			</div>

			<div class="rounded border border-[#d96c5a]/30 bg-[#141412] p-4">
				<div class="text-sm font-medium text-[#d96c5a]">Danger Zone</div>
				<p class="mt-1 text-xs text-[#6f6b5f]">Destructive actions cannot be undone.</p>
				<div class="mt-3">
					<button class="rounded border border-[#d96c5a] px-3 py-1.5 text-xs font-medium text-[#d96c5a] hover:bg-[#d96c5a] hover:text-[#0f0f0d]">
						Delete project
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
