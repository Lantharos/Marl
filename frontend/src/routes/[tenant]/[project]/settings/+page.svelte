<script lang="ts">
	import { page } from '$app/stores';
	import {
		getProjectAccess,
		getProjectSettings,
		isAbortError,
		updateProjectSettings,
		type AccessResponse,
		type MergeRules,
		type NavbarItem,
		type PanelItem,
		type ProjectAppearance,
		type ProjectSettings
	} from '$lib/api';
	import { DEFAULT_PROJECT_APPEARANCE } from '$lib/projectAppearance';
	import { DEFAULT_PROJECT_TABS, mergeProjectTabs } from '$lib/projectChrome';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import ProjectAppearanceSettings from '$lib/components/ProjectAppearanceSettings.svelte';
	import ProjectDangerZone from '$lib/components/ProjectDangerZone.svelte';
	import ProjectCollaboratorsSettings from '$lib/components/ProjectCollaboratorsSettings.svelte';
	import ProjectMergeRulesSettings from '$lib/components/ProjectMergeRulesSettings.svelte';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import SwitchControl from '$lib/components/SwitchControl.svelte';
	import X from 'lucide-svelte/icons/x';
	import Plus from 'lucide-svelte/icons/plus';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import ChevronUp from 'lucide-svelte/icons/chevron-up';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Spinner from '$lib/components/Spinner.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let settings = $state<ProjectSettings>({
		visibility: 'private',
		follower_count: 0,
		is_following: false,
		public_releases: false,
		archived_at: null,
		archived_by: null,
		archived_by_profile: null,
		default_workspace: 'main',
		appearance: DEFAULT_PROJECT_APPEARANCE,
		navbar_items: [],
		panels: [],
		merge_rules: {
			required_approvals: 0,
			require_passing_checks: false,
			dismiss_stale_approvals: true,
			block_unresolved_comments: true
		},
		protected_workspaces: []
	});
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let access = $state<AccessResponse | null>(null);

	const DEFAULT_PANELS: PanelItem[] = [
		{ id: 'workspaces', title: 'Workspaces', type: 'workspaces', enabled: true, order: 0 },
		{ id: 'leaves', title: 'Pinned leaves', type: 'leaves', enabled: true, order: 1 },
		{ id: 'releases', title: 'Releases', type: 'releases', enabled: true, order: 2 },
		{ id: 'activity', title: 'Activity', type: 'activity', enabled: true, order: 3 }
	];

	function withDefaultPanels(items: PanelItem[]) {
		const merged = items.filter((item) => item.id !== 'stats' && (item.type as string) !== 'stats');
		for (const item of DEFAULT_PANELS) {
			if (!merged.some((candidate) => candidate.id === item.id)) {
				merged.push({ ...item, order: merged.length });
			}
		}
		return merged;
	}

	const navbarItems = $derived(mergeProjectTabs(settings.navbar_items.length ? settings.navbar_items : DEFAULT_PROJECT_TABS));
	const panelItems = $derived(withDefaultPanels(settings.panels.length ? settings.panels : DEFAULT_PANELS));

	let showAddNavbar = $state(false);
	let showAddPanel = $state(false);
	let editingPanelIndex = $state<number | null>(null);
	let newNavbar: NavbarItem = $state({ id: '', label: '', type: 'link', url: '', enabled: true, order: 0 });
	let newPanel: PanelItem = $state({ id: '', title: '', type: 'text', content: '', enabled: true, order: 0 });
	const CUSTOM_PANEL_TYPES: PanelItem['type'][] = ['text', 'button', 'link', 'info'];

	function blankPanel(): PanelItem {
		return { id: '', title: '', type: 'text', content: '', enabled: true, order: 0 };
	}

	async function persistSettings(items: { appearance?: ProjectAppearance; navbar_items?: NavbarItem[]; panels?: PanelItem[]; public_releases?: boolean; merge_rules?: MergeRules; protected_workspaces?: string[] }) {
		busy = true;
		try {
			const result = await updateProjectSettings(tenant, project, items);
			settings = { ...settings, ...result };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function togglePublicReleases() {
		if (settings.visibility === 'public') return;
		const public_releases = !settings.public_releases;
		settings = { ...settings, public_releases };
		await persistSettings({ public_releases });
	}

	async function toggleNavbar(index: number) {
		const items = [...navbarItems];
		items[index] = { ...items[index], enabled: !items[index].enabled };
		settings = { ...settings, navbar_items: items };
		await persistSettings({ navbar_items: items });
	}

	async function reorderNavbar(index: number, direction: -1 | 1) {
		const items = [...navbarItems];
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= items.length) return;
		[items[index], items[newIndex]] = [items[newIndex], items[index]];
		items.forEach((item, i) => (item.order = i));
		settings = { ...settings, navbar_items: items };
		await persistSettings({ navbar_items: items });
	}

	async function removeNavbar(index: number) {
		const items = [...navbarItems];
		items.splice(index, 1);
		items.forEach((item, i) => (item.order = i));
		settings = { ...settings, navbar_items: items };
		await persistSettings({ navbar_items: items });
	}

	async function addNavbarItem() {
		if (!newNavbar.id || !newNavbar.label) return;
		const items = [...navbarItems];
		items.forEach((item) => (item.order += 1));
		const item = { ...newNavbar, order: 0 };
		items.unshift(item);
		settings = { ...settings, navbar_items: items };
		newNavbar = { id: '', label: '', type: 'link', url: '', enabled: true, order: 0 };
		showAddNavbar = false;
		await persistSettings({ navbar_items: items });
	}

	async function togglePanel(index: number) {
		const items = [...panelItems];
		items[index] = { ...items[index], enabled: !items[index].enabled };
		settings = { ...settings, panels: items };
		await persistSettings({ panels: items });
	}

	async function reorderPanel(index: number, direction: -1 | 1) {
		const items = [...panelItems];
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= items.length) return;
		[items[index], items[newIndex]] = [items[newIndex], items[index]];
		items.forEach((item, i) => (item.order = i));
		settings = { ...settings, panels: items };
		await persistSettings({ panels: items });
	}

	async function removePanel(index: number) {
		const items = [...panelItems];
		items.splice(index, 1);
		items.forEach((item, i) => (item.order = i));
		settings = { ...settings, panels: items };
		await persistSettings({ panels: items });
	}

	function openNewPanelModal() {
		editingPanelIndex = null;
		newPanel = blankPanel();
		showAddPanel = true;
	}

	function openEditPanelModal(index: number) {
		editingPanelIndex = index;
		newPanel = { ...panelItems[index] };
		showAddPanel = true;
	}

	function closePanelModal() {
		editingPanelIndex = null;
		newPanel = blankPanel();
		showAddPanel = false;
	}

	async function savePanelItem() {
		if (!newPanel.id || !newPanel.title) return;
		const items = [...panelItems];
		if (editingPanelIndex === null) {
			items.forEach((item) => (item.order += 1));
			items.unshift({ ...newPanel, order: 0 });
		} else {
			const existing = items[editingPanelIndex];
			items[editingPanelIndex] = { ...newPanel, order: existing?.order ?? editingPanelIndex };
		}
		settings = { ...settings, panels: items };
		closePanelModal();
		await persistSettings({ panels: items });
	}

	async function load(signal: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [loadedSettings, loadedAccess] = await Promise.all([
				getProjectSettings(tenant, project, { signal }),
				getProjectAccess(tenant, project, { signal })
			]);
			settings = loadedSettings;
			access = loadedAccess;
			currentProjectAccess.set(loadedAccess);
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	function setNewPanelType(type: PanelItem['type']) {
		newPanel = { ...newPanel, type };
	}

	const canManageProject = $derived(Boolean(access?.can_maintain));
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 grid gap-1">
		<h2 class="text-base font-semibold text-[#f0eee4]">Settings</h2>
		<p class="text-sm text-[#6f6b5f]">Project visibility, navigation, overview panels, access, and destructive actions.</p>
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if !canManageProject}
		<div class="border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">Project settings are limited to maintainers.</p>
		</div>
	{:else}
		<div class="grid gap-4">
			<SettingsSection title="Appearance">
				<ProjectAppearanceSettings
					appearance={settings.appearance}
					{busy}
					onSave={(appearance) => persistSettings({ appearance })}
				/>
			</SettingsSection>

			<SettingsSection title="Navigation">
				{#snippet actions()}
					<button class="flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] pl-1.5 pr-2.5 text-xs font-medium whitespace-nowrap text-[#eae9e4] hover:bg-[#2a2a28]" onclick={() => (showAddNavbar = true)}>
						<Plus class="h-3.5 w-3.5" /> Add
					</button>
				{/snippet}
				<div class="grid gap-1">
					{#each navbarItems as item, i (item.id)}
						<div class="flex items-center gap-2 border border-[#252522] bg-[#0f0f0d] px-2.5 py-2">
							<div class="flex items-center gap-0.5 shrink-0">
								<button
									class="flex h-4 w-4 items-center justify-center rounded text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === 0 || busy}
									aria-label="Move up"
									onclick={() => reorderNavbar(i, -1)}
								><ChevronUp class="h-3 w-3" /></button>
								<button
									class="flex h-4 w-4 items-center justify-center rounded text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === navbarItems.length - 1 || busy}
									aria-label="Move down"
									onclick={() => reorderNavbar(i, 1)}
								><ChevronDown class="h-3 w-3" /></button>
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-1.5">
									<span class="text-xs font-medium text-[#eae9e4] truncate">{item.label}</span>
									<span class="shrink-0 rounded bg-[#1e1e1c] px-1 py-0.5 text-[10px] text-[#6f6b5f] capitalize">{item.type}</span>
									{#if item.type === 'link' && item.url}
										<span class="truncate text-[10px] text-[#5c5c5a]">{item.url}</span>
									{/if}
								</div>
							</div>
							{#if !['', 'code', 'workspaces', 'issues', 'leaves', 'screenshots', 'releases', 'automation', 'history', 'settings'].includes(item.id)}
								<button class="flex h-7 w-7 shrink-0 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a] disabled:opacity-30" disabled={busy} onclick={() => removeNavbar(i)} aria-label={`Delete ${item.label}`}>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							{/if}
							<SwitchControl checked={item.enabled} disabled={busy} label={`Toggle ${item.label}`} onToggle={() => toggleNavbar(i)} />
						</div>
					{/each}
				</div>
			</SettingsSection>

			<SettingsSection title="Releases">
				<div class="flex items-center justify-between gap-4 border border-[#252522] bg-[#0f0f0d] px-3 py-3">
					<div class="min-w-0">
						<div class="text-sm font-medium text-[#eae9e4]">Public downloads</div>
						<p class="mt-1 text-xs text-[#6f6b5f]">
							{settings.visibility === 'public'
								? 'This project is public, so release files and source archives are already public.'
								: settings.public_releases
									? 'On: anyone can download published release files, including autoupdaters using the API. Source archives still require project access.'
									: 'Off: only people with project access can download release files and source archives.'}
						</p>
					</div>
					<SwitchControl checked={settings.visibility === 'public' || settings.public_releases} disabled={busy || settings.visibility === 'public'} label="Toggle public release downloads" onToggle={togglePublicReleases} />
				</div>
			</SettingsSection>

			<SettingsSection title="Merge rules">
				<ProjectMergeRulesSettings {settings} {busy} onSave={persistSettings} />
			</SettingsSection>

			<SettingsSection title="Overview panels">
				{#snippet actions()}
					<button class="flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] pl-1.5 pr-2.5 text-xs font-medium whitespace-nowrap text-[#eae9e4] hover:bg-[#2a2a28]" onclick={openNewPanelModal}>
						<Plus class="h-3.5 w-3.5" /> Add
					</button>
				{/snippet}
				<div class="grid gap-1">
					{#each panelItems as item, i (item.id)}
						<div class="flex items-center gap-2 border border-[#252522] bg-[#0f0f0d] px-2.5 py-2">
							<div class="flex items-center gap-0.5 shrink-0">
								<button
									class="flex h-4 w-4 items-center justify-center rounded text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === 0 || busy}
									aria-label="Move up"
									onclick={() => reorderPanel(i, -1)}
								><ChevronUp class="h-3 w-3" /></button>
								<button
									class="flex h-4 w-4 items-center justify-center rounded text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === panelItems.length - 1 || busy}
									aria-label="Move down"
									onclick={() => reorderPanel(i, 1)}
								><ChevronDown class="h-3 w-3" /></button>
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-1.5">
									<span class="text-xs font-medium text-[#eae9e4] truncate">{item.title}</span>
									<span class="shrink-0 rounded bg-[#1e1e1c] px-1 py-0.5 text-[10px] text-[#6f6b5f] capitalize">{item.type}</span>
								</div>
							</div>
							<button class="flex h-7 w-7 shrink-0 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4] disabled:opacity-30" disabled={busy} onclick={() => openEditPanelModal(i)} aria-label={`Edit ${item.title}`}>
								<Pencil class="h-3.5 w-3.5" />
							</button>
							{#if !['workspaces', 'leaves', 'releases', 'activity'].includes(item.id)}
								<button class="flex h-7 w-7 shrink-0 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a] disabled:opacity-30" disabled={busy} onclick={() => removePanel(i)} aria-label={`Delete ${item.title}`}>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							{/if}
							<SwitchControl checked={item.enabled} disabled={busy} label={`Toggle ${item.title}`} onToggle={() => togglePanel(i)} />
						</div>
					{/each}
				</div>
			</SettingsSection>

			<SettingsSection title="Collaborators">
				<div class="grid gap-3">
					<ProjectCollaboratorsSettings {tenant} {project} {access} />
				</div>
			</SettingsSection>

			<ProjectDangerZone
				{tenant}
				{project}
				{settings}
				{access}
				onSettings={(updatedSettings) => (settings = updatedSettings)}
				onError={(message) => (error = message)}
			/>
		</div>

		{#if showAddNavbar}
			<div class="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
				<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={() => (showAddNavbar = false)}></button>
				<div class="relative w-full max-w-lg border border-[#2a2a28] bg-[#141412] shadow-2xl shadow-black/40">
					<div class="flex h-12 items-center justify-between border-b border-[#252522] px-4">
						<div class="text-sm font-medium text-[#eae9e4]">Add navigation item</div>
						<button class="-mr-4 flex h-12 w-12 items-center justify-center text-[#8c887e] hover:text-[#eae9e4]" onclick={() => (showAddNavbar = false)} aria-label="Close">
							<X class="h-4 w-4" />
						</button>
					</div>
					<div class="grid gap-3 p-4">
						<div class="grid gap-3 sm:grid-cols-2">
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>ID</span>
								<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="docs" bind:value={newNavbar.id} />
							</label>
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>Label</span>
								<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Docs" bind:value={newNavbar.label} />
							</label>
						</div>
						<label class="grid gap-1 text-xs text-[#8c887e]">
							<span>URL</span>
							<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="https://docs.example.com" bind:value={newNavbar.url} />
						</label>
					</div>
					<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
						<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={() => (showAddNavbar = false)}>Cancel</button>
						<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !newNavbar.id.trim() || !newNavbar.label.trim()} onclick={addNavbarItem}>Add item</button>
					</div>
				</div>
			</div>
		{/if}

		{#if showAddPanel}
			<div class="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
				<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={closePanelModal}></button>
				<div class="relative w-full max-w-xl border border-[#2a2a28] bg-[#141412] shadow-2xl shadow-black/40">
					<div class="flex h-12 items-center justify-between border-b border-[#252522] px-4">
						<div class="text-sm font-medium text-[#eae9e4]">{editingPanelIndex === null ? 'Add overview panel' : 'Edit overview panel'}</div>
						<button class="-mr-4 flex h-12 w-12 items-center justify-center text-[#8c887e] hover:text-[#eae9e4]" onclick={closePanelModal} aria-label="Close">
							<X class="h-4 w-4" />
						</button>
					</div>
					<div class="grid gap-3 p-4">
						<div class="grid gap-3 sm:grid-cols-2">
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>ID</span>
								<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="my-panel" bind:value={newPanel.id} />
							</label>
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>Title</span>
								<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="My panel" bind:value={newPanel.title} />
							</label>
						</div>
						{#if editingPanelIndex === null || CUSTOM_PANEL_TYPES.includes(newPanel.type)}
							<div class="grid gap-1">
								<div class="text-xs text-[#8c887e]">Type</div>
								<div class="flex flex-wrap gap-1.5">
									{#each CUSTOM_PANEL_TYPES as type (type)}
										<button
											class="border px-2.5 py-1 text-xs capitalize {newPanel.type === type ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
											onclick={() => setNewPanelType(type)}
										>
											{type}
										</button>
									{/each}
								</div>
							</div>
						{/if}
						{#if newPanel.type === 'text' || newPanel.type === 'info'}
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>Content</span>
								<textarea class="min-h-24 border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Markdown content" bind:value={newPanel.content}></textarea>
							</label>
						{/if}
						{#if newPanel.type === 'button' || newPanel.type === 'link'}
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>URL</span>
								<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="https://..." bind:value={newPanel.url} />
							</label>
						{/if}
						{#if newPanel.type === 'button'}
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>Button label</span>
								<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Learn more" bind:value={newPanel.button_label} />
							</label>
						{/if}
						{#if newPanel.type === 'link'}
							<label class="grid gap-1 text-xs text-[#8c887e]">
								<span>Link text</span>
								<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="View documentation" bind:value={newPanel.content} />
							</label>
						{/if}
					</div>
					<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
						<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={closePanelModal}>Cancel</button>
						<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !newPanel.id.trim() || !newPanel.title.trim()} onclick={savePanelItem}>{editingPanelIndex === null ? 'Add panel' : 'Save panel'}</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
