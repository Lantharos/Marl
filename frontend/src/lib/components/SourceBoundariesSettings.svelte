<script lang="ts">
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import type { PathVisibilityRule } from '$lib/api';

	let {
		rules = [],
		busy = false,
		onSave
	}: {
		rules: PathVisibilityRule[];
		busy: boolean;
		onSave: (rules: PathVisibilityRule[]) => void | Promise<void>;
	} = $props();

	let newPathRule: PathVisibilityRule = $state({ path: '', visibility: 'private' });
	const VISIBILITY_OPTIONS: PathVisibilityRule['visibility'][] = ['public', 'team', 'private'];
	const pathVisibilityRules = $derived(rules ?? []);

	function cleanPathRule(path: string) {
		return path.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '').replace(/\/\*\*?$/g, '');
	}

	async function saveRules(nextRules: PathVisibilityRule[]) {
		await onSave(nextRules);
	}

	async function addPathRule() {
		const path = cleanPathRule(newPathRule.path);
		if (!path || path.includes('..')) return;
		const items = pathVisibilityRules.filter((rule) => rule.path !== path);
		items.push({ path, visibility: newPathRule.visibility });
		items.sort((a, b) => a.path.localeCompare(b.path));
		newPathRule = { path: '', visibility: 'private' };
		await saveRules(items);
	}

	async function removePathRule(index: number) {
		const items = [...pathVisibilityRules];
		items.splice(index, 1);
		await saveRules(items);
	}

	async function renamePathRule(index: number, event: Event) {
		const path = cleanPathRule((event.currentTarget as HTMLInputElement).value);
		const current = pathVisibilityRules[index];
		if (!current || !path || path === current.path || path.includes('..')) return;
		const items = pathVisibilityRules
			.map((rule, i) => (i === index ? { ...rule, path } : rule))
			.filter((rule, i, values) => values.findIndex((candidate) => candidate.path === rule.path) === i);
		items.sort((a, b) => a.path.localeCompare(b.path));
		await saveRules(items);
	}

	async function setPathRuleVisibility(index: number, visibility: PathVisibilityRule['visibility']) {
		const items = pathVisibilityRules.map((rule, i) => (i === index ? { ...rule, visibility } : rule));
		await saveRules(items);
	}
</script>

<div class="grid gap-3">
	<div class="text-sm text-[#8c887e]">
		Choose which paths stay public, team-only, or maintainer-only when the project source is read through sty.
	</div>
	<div class="grid gap-1">
		{#each pathVisibilityRules as rule, i (rule.path)}
			<div class="flex flex-col gap-2 border border-[#252522] bg-[#0f0f0d] px-2.5 py-2 sm:flex-row sm:items-center">
				<input
					class="h-8 min-w-0 flex-1 border border-[#2a2a28] bg-[#141412] px-2.5 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none"
					value={rule.path}
					onblur={(event) => renamePathRule(i, event)}
					disabled={busy}
				/>
				<div class="flex flex-wrap gap-1">
					{#each VISIBILITY_OPTIONS as visibility (visibility)}
						<button
							class="border px-2.5 py-1 text-xs capitalize disabled:opacity-40 {rule.visibility === visibility ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
							disabled={busy}
							onclick={() => setPathRuleVisibility(i, visibility)}
						>
							{visibility}
						</button>
					{/each}
					<button class="flex h-7 w-7 shrink-0 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a] disabled:opacity-30" disabled={busy} onclick={() => removePathRule(i)} aria-label={`Delete ${rule.path}`}>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
		{:else}
			<div class="border border-[#252522] bg-[#0f0f0d] px-3 py-3 text-sm text-[#6f6b5f]">
				No path boundaries are configured.
			</div>
		{/each}
	</div>
	<div class="flex flex-col gap-2 border border-[#252522] bg-[#0f0f0d] px-2.5 py-2 sm:flex-row sm:items-center">
		<input
			class="h-8 min-w-0 flex-1 border border-[#2a2a28] bg-[#141412] px-2.5 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none"
			placeholder="packages/internal"
			bind:value={newPathRule.path}
			disabled={busy}
		/>
		<div class="flex flex-wrap gap-1">
			{#each VISIBILITY_OPTIONS as visibility (visibility)}
				<button
					class="border px-2.5 py-1 text-xs capitalize disabled:opacity-40 {newPathRule.visibility === visibility ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
					disabled={busy}
					onclick={() => (newPathRule = { ...newPathRule, visibility })}
				>
					{visibility}
				</button>
			{/each}
			<button class="flex h-7 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] pl-1.5 pr-2.5 text-xs font-medium whitespace-nowrap text-[#eae9e4] hover:bg-[#2a2a28] disabled:opacity-40" disabled={busy || !newPathRule.path.trim()} onclick={addPathRule}>
				<Plus class="h-3.5 w-3.5" /> Add
			</button>
		</div>
	</div>
</div>
