<script lang="ts">
	import { page } from '$app/stores';
	import {
		getCapabilities,
		getProjectSettings,
		isAbortError,
		updateProjectSettings,
		type CapabilityResponse,
		type NavbarItem,
		type PanelItem,
		type ProjectSettings
	} from '$lib/api';
	import X from 'lucide-svelte/icons/x';
	import Plus from 'lucide-svelte/icons/plus';
	import Spinner from '$lib/components/Spinner.svelte';
	import SettingsFeatureList from '$lib/components/SettingsFeatureList.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let settings = $state<ProjectSettings>({
		visibility: 'private',
		starred_count: 0,
		is_starred: false,
		default_workspace: 'main',
		navbar_items: [],
		panels: []
	});
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let capabilities = $state<CapabilityResponse | null>(null);

	const DEFAULT_NAVBAR: NavbarItem[] = [
		{ id: '', label: 'Overview', type: 'tab', enabled: true, order: 0 },
		{ id: 'code', label: 'Code', type: 'tab', enabled: true, order: 1 },
		{ id: 'workspaces', label: 'Workspaces', type: 'tab', enabled: true, order: 2 },
		{ id: 'issues', label: 'Issues', type: 'tab', enabled: true, order: 3 },
		{ id: 'ready', label: 'Ready', type: 'tab', enabled: true, order: 4 },
		{ id: 'releases', label: 'Releases', type: 'tab', enabled: true, order: 5 },
		{ id: 'automation', label: 'Automation', type: 'tab', enabled: true, order: 6 },
		{ id: 'history', label: 'History', type: 'tab', enabled: true, order: 7 },
		{ id: 'settings', label: 'Settings', type: 'tab', enabled: true, order: 8 }
	];

	const DEFAULT_PANELS: PanelItem[] = [
		{ id: 'stats', title: 'Stats', type: 'stats', enabled: true, order: 0 },
		{ id: 'workspaces', title: 'Workspaces', type: 'workspaces', enabled: true, order: 1 },
		{ id: 'activity', title: 'Activity', type: 'activity', enabled: true, order: 2 }
	];

	function withDefaultNavbar(items: NavbarItem[]) {
		const merged = [...items];
		for (const item of DEFAULT_NAVBAR) {
			if (!merged.some((candidate) => candidate.id === item.id)) {
				merged.push({ ...item, order: merged.length });
			}
		}
		return merged;
	}

	const navbarItems = $derived(withDefaultNavbar(settings.navbar_items.length ? settings.navbar_items : DEFAULT_NAVBAR));
	const panelItems = $derived(settings.panels.length ? settings.panels : DEFAULT_PANELS);

	let showAddNavbar = $state(false);
	let showAddPanel = $state(false);
	let newNavbar: NavbarItem = $state({ id: '', label: '', type: 'link', url: '', enabled: true, order: 0 });
	let newPanel: PanelItem = $state({ id: '', title: '', type: 'text', content: '', enabled: true, order: 0 });

	async function persistSettings(items: { navbar_items?: NavbarItem[]; panels?: PanelItem[] }) {
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
		const items = [...(settings.panels.length ? settings.panels : DEFAULT_PANELS)];
		items[index] = { ...items[index], enabled: !items[index].enabled };
		settings = { ...settings, panels: items };
		await persistSettings({ panels: items });
	}

	async function reorderPanel(index: number, direction: -1 | 1) {
		const items = [...(settings.panels.length ? settings.panels : DEFAULT_PANELS)];
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= items.length) return;
		[items[index], items[newIndex]] = [items[newIndex], items[index]];
		items.forEach((item, i) => (item.order = i));
		settings = { ...settings, panels: items };
		await persistSettings({ panels: items });
	}

	async function removePanel(index: number) {
		const items = [...(settings.panels.length ? settings.panels : DEFAULT_PANELS)];
		items.splice(index, 1);
		items.forEach((item, i) => (item.order = i));
		settings = { ...settings, panels: items };
		await persistSettings({ panels: items });
	}

	async function addPanelItem() {
		if (!newPanel.id || !newPanel.title) return;
		const items = [...(settings.panels.length ? settings.panels : DEFAULT_PANELS)];
		items.forEach((item) => (item.order += 1));
		const item = { ...newPanel, order: 0 };
		items.unshift(item);
		settings = { ...settings, panels: items };
		newPanel = { id: '', title: '', type: 'text', content: '', enabled: true, order: 0 };
		showAddPanel = false;
		await persistSettings({ panels: items });
	}

	async function load(signal: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [projectSettings, caps] = await Promise.all([
				getProjectSettings(tenant, project, { signal }),
				getCapabilities({ signal }).catch(() => null)
			]);
			settings = projectSettings;
			capabilities = caps;
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

	async function handleVisibilityChange(next: 'public' | 'private') {
		if (next === settings.visibility) return;
		busy = true;
		try {
			const result = await updateProjectSettings(tenant, project, { visibility: next });
			settings = { ...settings, visibility: result.visibility };
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
		<Spinner />
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

			<SettingsFeatureList {capabilities} />

			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<div class="text-sm font-medium text-[#eae9e4]">Navigation</div>
						<p class="mt-1 text-xs text-[#6f6b5f]">Customize the project navigation bar. Enable, disable, reorder, or add external links.</p>
					</div>
					<button class="ml-3 shrink-0 flex items-center gap-1 rounded bg-[#2a2a28] pl-1.5 pr-2.5 py-1 text-xs font-medium whitespace-nowrap text-[#eae9e4] hover:bg-[#3a3a36]" onclick={() => (showAddNavbar = !showAddNavbar)}>
						<Plus class="h-3.5 w-3.5" /> Add
					</button>
				</div>
				<div class="mt-3 grid gap-1">
					{#each navbarItems as item, i}
						<div class="flex items-center gap-2 rounded bg-[#0f0f0d] px-2.5 py-2">
							<div class="flex items-center gap-0.5 shrink-0">
								<button
									class="text-[10px] text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === 0 || busy}
									onclick={() => reorderNavbar(i, -1)}
								>▲</button>
								<button
									class="text-[10px] text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === navbarItems.length - 1 || busy}
									onclick={() => reorderNavbar(i, 1)}
								>▼</button>
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
							<button
								class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium {item.enabled ? 'bg-[#7cb97c]/20 text-[#7cb97c]' : 'bg-[#d96c5a]/20 text-[#d96c5a]'}"
								disabled={busy}
								onclick={() => toggleNavbar(i)}
							>
								{item.enabled ? 'on' : 'off'}
							</button>
							{#if !['', 'code', 'workspaces', 'issues', 'ready', 'releases', 'automation', 'history', 'settings'].includes(item.id)}
								<button class="shrink-0 text-[#5c5c5a] hover:text-[#d96c5a] disabled:opacity-30" disabled={busy} onclick={() => removeNavbar(i)}><X class="h-3.5 w-3.5" /></button>
							{/if}
						</div>
					{/each}
				</div>
				{#if showAddNavbar}
					<div class="mt-2 rounded bg-[#0f0f0d] p-3 grid gap-2">
						<div class="grid grid-cols-2 gap-2">
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">ID</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="docs" bind:value={newNavbar.id} />
							</div>
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">Label</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="Docs" bind:value={newNavbar.label} />
							</div>
						</div>
						{#if newNavbar.type === 'link'}
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">URL</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="https://docs.example.com" bind:value={newNavbar.url} />
							</div>
						{/if}
						<div class="flex gap-2">
							<button class="rounded bg-[#2a2a28] px-3 py-1 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]" disabled={busy} onclick={addNavbarItem}>Add</button>
							<button class="rounded px-3 py-1 text-xs text-[#6f6b5f] hover:text-[#a09d94]" onclick={() => (showAddNavbar = false)}>Cancel</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<div class="text-sm font-medium text-[#eae9e4]">Overview Panels</div>
						<p class="mt-1 text-xs text-[#6f6b5f]">Customize the sidebar panels on the project overview page. Add text, buttons, links, or built-in panels.</p>
					</div>
					<button class="ml-3 shrink-0 flex items-center gap-1 rounded bg-[#2a2a28] pl-1.5 pr-2.5 py-1 text-xs font-medium whitespace-nowrap text-[#eae9e4] hover:bg-[#3a3a36]" onclick={() => (showAddPanel = !showAddPanel)}>
						<Plus class="h-3.5 w-3.5" /> Add
					</button>
				</div>
				<div class="mt-3 grid gap-1">
					{#each panelItems as item, i}
						<div class="flex items-center gap-2 rounded bg-[#0f0f0d] px-2.5 py-2">
							<div class="flex items-center gap-0.5 shrink-0">
								<button
									class="text-[10px] text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === 0 || busy}
									onclick={() => reorderPanel(i, -1)}
								>▲</button>
								<button
									class="text-[10px] text-[#5c5c5a] hover:text-[#a09d94] disabled:opacity-30"
									disabled={i === panelItems.length - 1 || busy}
									onclick={() => reorderPanel(i, 1)}
								>▼</button>
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-1.5">
									<span class="text-xs font-medium text-[#eae9e4] truncate">{item.title}</span>
									<span class="shrink-0 rounded bg-[#1e1e1c] px-1 py-0.5 text-[10px] text-[#6f6b5f] capitalize">{item.type}</span>
								</div>
							</div>
							<button
								class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium {item.enabled ? 'bg-[#7cb97c]/20 text-[#7cb97c]' : 'bg-[#d96c5a]/20 text-[#d96c5a]'}"
								disabled={busy}
								onclick={() => togglePanel(i)}
							>
								{item.enabled ? 'on' : 'off'}
							</button>
							{#if !['stats', 'workspaces', 'activity'].includes(item.id)}
								<button class="shrink-0 text-[#5c5c5a] hover:text-[#d96c5a] disabled:opacity-30" disabled={busy} onclick={() => removePanel(i)}><X class="h-3.5 w-3.5" /></button>
							{/if}
						</div>
					{/each}
				</div>
				{#if showAddPanel}
					<div class="mt-2 rounded bg-[#0f0f0d] p-3 grid gap-2">
						<div class="grid grid-cols-2 gap-2">
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">ID</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="my-panel" bind:value={newPanel.id} />
							</div>
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">Title</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="My Panel" bind:value={newPanel.title} />
							</div>
						</div>
						<div>
							<div class="text-[10px] text-[#6f6b5f] mb-1">Type</div>
							<select class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" bind:value={newPanel.type}>
								<option value="text">Text (markdown)</option>
								<option value="button">Button</option>
								<option value="link">Link</option>
								<option value="info">Info (markdown)</option>
							</select>
						</div>
						{#if newPanel.type === 'text' || newPanel.type === 'info'}
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">Content (markdown)</div>
								<textarea class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" rows="3" placeholder="Your markdown content here..." bind:value={newPanel.content}></textarea>
							</div>
						{/if}
						{#if newPanel.type === 'button' || newPanel.type === 'link'}
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">URL</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="https://..." bind:value={newPanel.url} />
							</div>
						{/if}
						{#if newPanel.type === 'button'}
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">Button label</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="Learn more" bind:value={newPanel.button_label} />
							</div>
						{/if}
						{#if newPanel.type === 'link'}
							<div>
								<div class="text-[10px] text-[#6f6b5f] mb-1">Link text</div>
								<input class="w-full rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#eae9e4] outline-none" placeholder="View documentation" bind:value={newPanel.content} />
							</div>
						{/if}
						<div class="flex gap-2">
							<button class="rounded bg-[#2a2a28] px-3 py-1 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]" disabled={busy} onclick={addPanelItem}>Add</button>
							<button class="rounded px-3 py-1 text-xs text-[#6f6b5f] hover:text-[#a09d94]" onclick={() => (showAddPanel = false)}>Cancel</button>
						</div>
					</div>
				{/if}
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
