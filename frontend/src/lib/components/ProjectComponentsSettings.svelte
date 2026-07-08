<script lang="ts">
	import type { ProjectComponent } from '$lib/api';
	import { detectProjectSetup, mergeComponents } from '$lib/componentDetection';
	import Wand2 from 'lucide-svelte/icons/wand-2';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';

	type DraftComponent = ProjectComponent & {
		paths_text: string;
		depends_on_text: string;
		owners_text: string;
		deploy_targets_text: string;
		issue_labels_text: string;
	};

	let { tenant, project, components, busy = false, onSave }: { tenant: string; project: string; components: ProjectComponent[]; busy?: boolean; onSave: (components: ProjectComponent[]) => Promise<void> | void } = $props();
	let detectBusy = $state(false);
	let detectError = $state('');

	let draft = $state<DraftComponent>({
		id: '',
		name: '',
		paths: [],
		paths_text: '',
		depends_on: [],
		depends_on_text: '',
		owners: [],
		owners_text: '',
		language: '',
		framework: '',
		build_command: '',
		test_command: '',
		deploy_targets: [],
		deploy_targets_text: '',
		issue_labels: [],
		issue_labels_text: '',
		release_policy: 'independent',
		version_policy: 'independent',
		visible: true,
		require_owner_approval: false,
		order: 0
	});

	const orderedComponents = $derived([...(components ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)));

	function splitList(value: string) {
		return value
			.split(/[\n,]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function componentFromDraft(order: number): ProjectComponent | null {
		const id = draft.id.trim();
		const name = draft.name.trim();
		const paths = splitList(draft.paths_text);
		if (!id || !name || paths.length === 0) return null;
		return {
			id,
			name,
			paths,
			depends_on: splitList(draft.depends_on_text),
			owners: splitList(draft.owners_text),
			language: draft.language?.trim() || null,
			framework: draft.framework?.trim() || null,
			build_command: draft.build_command?.trim() || null,
			test_command: draft.test_command?.trim() || null,
			deploy_targets: splitList(draft.deploy_targets_text),
			issue_labels: splitList(draft.issue_labels_text),
			release_policy: draft.release_policy || null,
			version_policy: draft.version_policy || null,
			visible: draft.visible ?? true,
			require_owner_approval: draft.require_owner_approval ?? false,
			order
		};
	}

	function resetDraft() {
		draft = {
			id: '',
			name: '',
			paths: [],
			paths_text: '',
			depends_on: [],
			depends_on_text: '',
			owners: [],
			owners_text: '',
			language: '',
			framework: '',
			build_command: '',
			test_command: '',
			deploy_targets: [],
			deploy_targets_text: '',
			issue_labels: [],
			issue_labels_text: '',
			release_policy: 'independent',
			version_policy: 'independent',
			visible: true,
			require_owner_approval: false,
			order: 0
		};
	}

	async function addComponent() {
		const next = componentFromDraft(orderedComponents.length);
		if (!next) return;
		await onSave([...orderedComponents.filter((item) => item.id !== next.id), next].map((item, order) => ({ ...item, order })));
		resetDraft();
	}

	async function removeComponent(id: string) {
		await onSave(orderedComponents.filter((item) => item.id !== id).map((item, order) => ({ ...item, order })));
	}

	async function detectComponents() {
		detectBusy = true;
		detectError = '';
		try {
			const detected = await detectProjectSetup(tenant, project);
			if (!detected.components.length) {
				detectError = 'No components found in main.';
				return;
			}
			await onSave(mergeComponents(orderedComponents, detected.components));
		} catch (e) {
			detectError = e instanceof Error ? e.message : 'Failed to detect components';
		} finally {
			detectBusy = false;
		}
	}
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap items-center justify-between gap-2 border border-[#252522] bg-[#0f0f0d] px-3 py-2">
		<div class="text-sm text-[#a09d94]">Detect components from package and workspace manifests.</div>
		<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] px-2.5 text-xs text-[#eae9e4] hover:bg-[#252522] disabled:opacity-50" disabled={busy || detectBusy} onclick={detectComponents}>
			<Wand2 class="h-3.5 w-3.5" /> Detect
		</button>
	</div>
	{#if detectError}
		<div class="text-xs text-[#d96c5a]">{detectError}</div>
	{/if}
	{#if orderedComponents.length > 0}
		<div class="grid gap-1">
			{#each orderedComponents as component (component.id)}
				<div class="grid gap-2 border border-[#252522] bg-[#0f0f0d] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="text-sm font-medium text-[#eae9e4]">{component.name}</span>
							<span class="text-xs text-[#6f6b5f]">{component.id}</span>
						</div>
						<div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#8c887e]">
							<span>{component.paths.join(', ')}</span>
							{#if component.owners?.length}
								<span>owned by {component.owners.map((owner) => `@${owner}`).join(', ')}</span>
							{/if}
							{#if component.release_policy}
								<span>{component.release_policy} releases</span>
							{/if}
							{#if component.depends_on?.length}
								<span>depends on {component.depends_on.join(', ')}</span>
							{/if}
							{#if component.require_owner_approval}
								<span>owner approval</span>
							{/if}
						</div>
						{#if component.build_command || component.test_command}
							<div class="mt-1 grid gap-1 text-xs text-[#6f6b5f]">
								{#if component.build_command}<code class="truncate">{component.build_command}</code>{/if}
								{#if component.test_command}<code class="truncate">{component.test_command}</code>{/if}
							</div>
						{/if}
					</div>
					<button class="flex h-8 w-8 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a] disabled:opacity-30" disabled={busy} onclick={() => removeComponent(component.id)} aria-label={`Delete ${component.name}`}>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div class="grid gap-3 border border-[#252522] bg-[#0f0f0d] p-3">
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-xs text-[#8c887e]">
				<span>ID</span>
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="sty-web" bind:value={draft.id} />
			</label>
			<label class="grid gap-1 text-xs text-[#8c887e]">
				<span>Name</span>
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Sty web" bind:value={draft.name} />
			</label>
		</div>
		<label class="grid gap-1 text-xs text-[#8c887e]">
			<span>Paths</span>
			<textarea class="min-h-16 border border-[#2a2a28] bg-[#141412] px-3 py-2 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="apps/web&#10;packages/ui" bind:value={draft.paths_text}></textarea>
		</label>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-xs text-[#8c887e]">
				<span>Owners</span>
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="frontend, design" bind:value={draft.owners_text} />
			</label>
			<label class="grid gap-1 text-xs text-[#8c887e]">
				<span>Depends on</span>
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="packages-ui, sty-core" bind:value={draft.depends_on_text} />
			</label>
			<label class="grid gap-1 text-xs text-[#8c887e]">
				<span>Deploy targets</span>
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="production, preview" bind:value={draft.deploy_targets_text} />
			</label>
			<label class="grid gap-1 text-xs text-[#8c887e]">
				<span>Build</span>
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="bun run build:web" bind:value={draft.build_command} />
			</label>
			<label class="grid gap-1 text-xs text-[#8c887e]">
				<span>Test</span>
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="bun test apps/web" bind:value={draft.test_command} />
			</label>
		</div>
		<button class="w-fit border border-[#2a2a28] px-2.5 py-1 text-xs {draft.require_owner_approval ? 'border-[#d9a66c] text-[#d9a66c]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" type="button" aria-pressed={draft.require_owner_approval} onclick={() => (draft.require_owner_approval = !draft.require_owner_approval)}>
			Owner approval
		</button>
		<div class="flex justify-end">
			<button class="flex h-8 items-center gap-1 bg-[#eae9e4] pl-2 pr-3 text-xs font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !draft.id.trim() || !draft.name.trim() || !draft.paths_text.trim()} onclick={addComponent}>
				<Plus class="h-3.5 w-3.5" /> Add component
			</button>
		</div>
	</div>
</div>
