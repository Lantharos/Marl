<script lang="ts">
	import { goto } from '$app/navigation';
	import { deleteProject, updateProjectSettings, type AccessResponse, type ProjectSettings } from '$lib/api';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';

	let {
		tenant,
		project,
		settings,
		access,
		onSettings,
		onError
	}: {
		tenant: string;
		project: string;
		settings: ProjectSettings;
		access: AccessResponse | null;
		onSettings: (settings: ProjectSettings) => void;
		onError: (message: string) => void;
	} = $props();

	let busy = $state(false);
	let visibilityArmedFor = $state<'public' | 'private' | null>(null);
	let confirmAction = $state<'archive' | 'unarchive' | 'delete' | null>(null);

	const canDeleteProject = $derived(Boolean(access?.can_admin));
	const visibilityAction = $derived(settings.visibility === 'public' ? 'Make private' : 'Make public');
	const nextVisibility = $derived(settings.visibility === 'public' ? 'private' : 'public');
	const archiveAction = $derived(settings.archived_at ? 'Unarchive project' : 'Archive project');

	async function handleVisibilityChange(next: 'public' | 'private') {
		if (next === settings.visibility) return;
		busy = true;
		try {
			const result = await updateProjectSettings(tenant, project, { visibility: next });
			onSettings({ ...settings, visibility: result.visibility });
		} catch (e) {
			onError(e instanceof Error ? e.message : 'Failed');
		} finally {
			visibilityArmedFor = null;
			busy = false;
		}
	}

	async function armVisibilityChange(next: 'public' | 'private') {
		if (visibilityArmedFor !== next) {
			visibilityArmedFor = next;
			return;
		}
		await handleVisibilityChange(next);
	}

	async function handleArchiveChange(next: boolean) {
		const archived = Boolean(settings.archived_at);
		if (next === archived) return;
		busy = true;
		try {
			const result = await updateProjectSettings(tenant, project, { archived: next });
			onSettings({ ...settings, ...result });
		} catch (e) {
			onError(e instanceof Error ? e.message : 'Failed');
		} finally {
			busy = false;
		}
	}

	async function handleDeleteProject() {
		busy = true;
		try {
			await deleteProject(tenant, project);
			await goto(`/${tenant}`);
		} catch (e) {
			onError(e instanceof Error ? e.message : 'Failed');
		} finally {
			busy = false;
		}
	}

	async function handleConfirmAction() {
		const action = confirmAction;
		if (!action) return;
		if (action === 'delete') {
			await handleDeleteProject();
			return;
		}
		await handleArchiveChange(action === 'archive');
		confirmAction = null;
	}

	function confirmTitle() {
		if (confirmAction === 'delete') return 'Delete project';
		if (confirmAction === 'archive') return 'Archive project';
		return 'Unarchive project';
	}

	function confirmBody() {
		if (confirmAction === 'delete') return 'This removes the project from sty. This cannot be undone.';
		if (confirmAction === 'archive') return 'This makes the project read-only and blocks sync pushes until it is unarchived.';
		return 'This unlocks writes and sync pushes for collaborators with write access.';
	}

	function confirmLabel() {
		if (confirmAction === 'delete') return 'Delete project';
		if (confirmAction === 'archive') return 'Archive project';
		return 'Unarchive project';
	}
</script>

<div class="border border-[#d96c5a]/30 bg-[#141412] p-4">
	<div class="text-sm font-medium text-[#d96c5a]">Danger Zone</div>
	<p class="mt-1 text-xs text-[#6f6b5f]">Visibility changes affect who can see the project. Archived projects are read-only.</p>
	<div class="mt-3 grid gap-2">
		<div class="flex items-center justify-between gap-3 border border-[#252522] bg-[#0f0f0d] px-3 py-2">
			<div class="min-w-0">
				<div class="text-xs font-medium text-[#eae9e4]">{settings.visibility === 'public' ? 'Public project' : 'Private project'}</div>
				<div class="mt-0.5 text-[11px] text-[#6f6b5f]">{settings.visibility === 'public' ? 'Anyone can read this project.' : 'Only collaborators can read this project.'}</div>
			</div>
			<button
				class="shrink-0 border border-[#2a2a28] px-3 py-1.5 text-xs font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4] disabled:opacity-50"
				disabled={busy}
				onclick={() => armVisibilityChange(nextVisibility as 'public' | 'private')}
			>
				{visibilityArmedFor === nextVisibility ? 'Confirm' : visibilityAction}
			</button>
		</div>
		<div class="flex items-center justify-between gap-3 border border-[#252522] bg-[#0f0f0d] px-3 py-2">
			<div class="min-w-0">
				<div class="text-xs font-medium text-[#eae9e4]">{settings.archived_at ? 'Archived project' : 'Active project'}</div>
				<div class="mt-0.5 text-[11px] text-[#6f6b5f]">{settings.archived_at ? 'Writes and sync pushes are locked.' : 'Archive this project to make it read-only.'}</div>
			</div>
			<button
				class="shrink-0 border border-[#d96c5a] px-3 py-1.5 text-xs font-medium text-[#d96c5a] hover:bg-[#d96c5a] hover:text-[#0f0f0d] disabled:opacity-50"
				disabled={busy}
				onclick={() => (confirmAction = settings.archived_at ? 'unarchive' : 'archive')}
			>
				{archiveAction}
			</button>
		</div>
		<div class="flex items-center justify-between gap-3 border border-[#252522] bg-[#0f0f0d] px-3 py-2">
			<div class="min-w-0">
				<div class="text-xs font-medium text-[#eae9e4]">Delete project</div>
				<div class="mt-0.5 text-[11px] text-[#6f6b5f]">{canDeleteProject ? 'Remove this project from sty.' : 'Only owners can delete this project.'}</div>
			</div>
			<button
				class="shrink-0 border border-[#d96c5a] px-3 py-1.5 text-xs font-medium text-[#d96c5a] hover:bg-[#d96c5a] hover:text-[#0f0f0d] disabled:opacity-50"
				disabled={busy || !canDeleteProject}
				onclick={() => (confirmAction = 'delete')}
			>
				Delete project
			</button>
		</div>
	</div>
</div>

{#if confirmAction}
	<ConfirmModal
		title={confirmTitle()}
		body={confirmBody()}
		confirmLabel={confirmLabel()}
		destructive={confirmAction !== 'unarchive'}
		{busy}
		onCancel={() => (confirmAction = null)}
		onConfirm={handleConfirmAction}
	/>
{/if}
