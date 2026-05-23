<script lang="ts">
	import SwitchControl from '$lib/components/SwitchControl.svelte';
	import type { MergeRules, ProjectSettings } from '$lib/api';

	let {
		settings,
		busy,
		onSave
	}: {
		settings: ProjectSettings;
		busy: boolean;
		onSave: (settings: Partial<ProjectSettings>) => Promise<void> | void;
	} = $props();

	const approvalCounts = [0, 1, 2, 3, 4, 5, 6];
	const mainProtected = $derived(settings.protected_workspaces.includes('main'));

	function updateRules(next: Partial<MergeRules>) {
		return onSave({ merge_rules: { ...settings.merge_rules, ...next } });
	}

	function setMainProtected(protectedWorkspace: boolean) {
		const protected_workspaces = protectedWorkspace
			? [...new Set([...settings.protected_workspaces, 'main'])]
			: settings.protected_workspaces.filter((workspace) => workspace !== 'main');
		return onSave({ protected_workspaces });
	}
</script>

<div class="grid gap-3">
	<div class="flex items-center justify-between gap-4 border border-[#252522] bg-[#0f0f0d] px-3 py-3">
		<div class="min-w-0">
			<div class="text-sm font-medium text-[#eae9e4]">Protected main</div>
			<p class="mt-1 text-xs text-[#6f6b5f]">Direct sync pushes to main are blocked. Changes land through a ready workspace merge.</p>
		</div>
		<SwitchControl checked={mainProtected} disabled={busy} label="Toggle protected main" onToggle={() => setMainProtected(!mainProtected)} />
	</div>

	<div class="grid gap-2 border border-[#252522] bg-[#0f0f0d] px-3 py-3">
		<div class="text-sm font-medium text-[#eae9e4]">Required approvals</div>
		<div class="flex flex-wrap gap-1.5">
			{#each approvalCounts as count (count)}
				<button
					class="h-8 min-w-8 border px-2 text-xs {settings.merge_rules.required_approvals === count ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
					disabled={busy}
					onclick={() => updateRules({ required_approvals: count })}
				>
					{count}
				</button>
			{/each}
		</div>
	</div>

	<div class="grid gap-1">
		<div class="flex items-center justify-between gap-4 border border-[#252522] bg-[#0f0f0d] px-3 py-3">
			<div class="min-w-0">
				<div class="text-sm font-medium text-[#eae9e4]">Passing checks</div>
				<p class="mt-1 text-xs text-[#6f6b5f]">Ready workspaces need successful check runs before merge.</p>
			</div>
			<SwitchControl checked={settings.merge_rules.require_passing_checks} disabled={busy} label="Toggle required checks" onToggle={() => updateRules({ require_passing_checks: !settings.merge_rules.require_passing_checks })} />
		</div>
		<div class="flex items-center justify-between gap-4 border border-[#252522] bg-[#0f0f0d] px-3 py-3">
			<div class="min-w-0">
				<div class="text-sm font-medium text-[#eae9e4]">Stale approvals</div>
				<p class="mt-1 text-xs text-[#6f6b5f]">Approvals apply only to the current workspace head.</p>
			</div>
			<SwitchControl checked={settings.merge_rules.dismiss_stale_approvals} disabled={busy} label="Toggle stale approval dismissal" onToggle={() => updateRules({ dismiss_stale_approvals: !settings.merge_rules.dismiss_stale_approvals })} />
		</div>
		<div class="flex items-center justify-between gap-4 border border-[#252522] bg-[#0f0f0d] px-3 py-3">
			<div class="min-w-0">
				<div class="text-sm font-medium text-[#eae9e4]">File conversations</div>
				<p class="mt-1 text-xs text-[#6f6b5f]">Unresolved file conversations block merge.</p>
			</div>
			<SwitchControl checked={settings.merge_rules.block_unresolved_comments} disabled={busy} label="Toggle unresolved conversation blocking" onToggle={() => updateRules({ block_unresolved_comments: !settings.merge_rules.block_unresolved_comments })} />
		</div>
	</div>
</div>
