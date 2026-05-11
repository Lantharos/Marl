<script lang="ts">
	import type { ProjectAppearance } from '$lib/api';
	import {
		DEFAULT_PROJECT_APPEARANCE,
		isHexColor,
		normalizeHexColor,
		normalizeProjectAppearance,
		projectAppearanceStyle
	} from '$lib/projectAppearance';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import Check from 'lucide-svelte/icons/check';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';

	type AppearanceKey = keyof ProjectAppearance;

	let {
		appearance = DEFAULT_PROJECT_APPEARANCE,
		busy = false,
		onSave
	}: {
		appearance?: ProjectAppearance;
		busy?: boolean;
		onSave: (appearance: ProjectAppearance) => Promise<void> | void;
	} = $props();

	const fields: { key: AppearanceKey; label: string }[] = [
		{ key: 'accent_color', label: 'Accent' },
		{ key: 'background_color', label: 'Background' },
		{ key: 'surface_color', label: 'Surface' },
		{ key: 'foreground_color', label: 'Text' },
		{ key: 'muted_color', label: 'Muted text' },
		{ key: 'border_color', label: 'Border' },
		{ key: 'nav_background_color', label: 'Navigation background' },
		{ key: 'nav_foreground_color', label: 'Navigation text' },
		{ key: 'nav_muted_color', label: 'Navigation muted' },
		{ key: 'primary_color', label: 'Primary button' },
		{ key: 'primary_foreground_color', label: 'Primary text' },
		{ key: 'code_background_color', label: 'Code background' }
	];

	const presets: { name: string; colors: ProjectAppearance }[] = [
		{ name: 'Classic', colors: DEFAULT_PROJECT_APPEARANCE },
		{
			name: 'Moss',
			colors: {
				...DEFAULT_PROJECT_APPEARANCE,
				accent_color: '#8fbf73',
				background_color: '#0d100c',
				surface_color: '#151a13',
				muted_color: '#8f9b86',
				border_color: '#283025',
				nav_background_color: '#10150f',
				primary_color: '#dce8d4',
				primary_foreground_color: '#0d100c',
				code_background_color: '#090c08'
			}
		},
		{
			name: 'Violet',
			colors: {
				...DEFAULT_PROJECT_APPEARANCE,
				accent_color: '#b394ff',
				background_color: '#100d13',
				surface_color: '#19131f',
				muted_color: '#9b8da8',
				border_color: '#30273a',
				nav_background_color: '#141019',
				primary_color: '#eee8ff',
				primary_foreground_color: '#100d13',
				code_background_color: '#0b0810'
			}
		},
		{
			name: 'Ice',
			colors: {
				...DEFAULT_PROJECT_APPEARANCE,
				accent_color: '#79bde8',
				background_color: '#0b1013',
				surface_color: '#11191d',
				muted_color: '#8299a5',
				border_color: '#24323a',
				nav_background_color: '#0e1519',
				primary_color: '#d9eef8',
				primary_foreground_color: '#0b1013',
				code_background_color: '#070b0d'
			}
		}
	];

	let draft = $state<ProjectAppearance>({ ...DEFAULT_PROJECT_APPEARANCE });
	let saving = $state(false);
	let lastAppearance = $state('');

	const normalizedDraft = $derived(normalizeProjectAppearance(draft));
	const invalid = $derived(fields.some((field) => !isHexColor(draft[field.key])));
	const dirty = $derived(JSON.stringify(normalizeProjectAppearance(appearance)) !== JSON.stringify(normalizedDraft));

	$effect(() => {
		const next = JSON.stringify(normalizeProjectAppearance(appearance));
		if (next === lastAppearance || saving) return;
		draft = normalizeProjectAppearance(appearance);
		lastAppearance = next;
	});

	function updateColor(key: AppearanceKey, value: string) {
		draft = { ...draft, [key]: value };
	}

	function normalizeColor(key: AppearanceKey) {
		draft = {
			...draft,
			[key]: normalizeHexColor(draft[key], DEFAULT_PROJECT_APPEARANCE[key])
		};
	}

	function applyPreset(colors: ProjectAppearance) {
		draft = normalizeProjectAppearance(colors);
	}

	async function save() {
		if (invalid || !dirty || saving) return;
		saving = true;
		try {
			const colors = normalizeProjectAppearance(draft);
			await onSave(colors);
			draft = colors;
			lastAppearance = JSON.stringify(colors);
		} finally {
			saving = false;
		}
	}
</script>

<div class="grid gap-4">
	<div class="flex flex-wrap gap-2">
		{#each presets as preset (preset.name)}
			<button
				class="flex h-9 items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2.5 text-xs text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
				onclick={() => applyPreset(preset.colors)}
				disabled={busy || saving}
			>
				<span class="flex -space-x-1">
					<span class="h-4 w-4 border border-[#2a2a28]" style={`background: ${preset.colors.background_color}`}></span>
					<span class="h-4 w-4 border border-[#2a2a28]" style={`background: ${preset.colors.surface_color}`}></span>
					<span class="h-4 w-4 border border-[#2a2a28]" style={`background: ${preset.colors.accent_color}`}></span>
				</span>
				{preset.name}
			</button>
		{/each}
	</div>

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
		<div class="grid gap-3 sm:grid-cols-2">
			{#each fields as field (field.key)}
				<div class="grid gap-1 text-xs text-[#8c887e]">
					<span>{field.label}</span>
					<div class="flex h-9 items-center border border-[#2a2a28] bg-[#0f0f0d] focus-within:border-[#d9a66c]">
						<ColorPicker
							label={field.label}
							value={draft[field.key]}
							fallback={DEFAULT_PROJECT_APPEARANCE[field.key]}
							disabled={busy || saving}
							onChange={(value) => updateColor(field.key, value)}
						/>
						<input
							class="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus-visible:outline-none"
							value={draft[field.key]}
							oninput={(event) => updateColor(field.key, event.currentTarget.value)}
							onblur={() => normalizeColor(field.key)}
							placeholder="#d9a66c"
						/>
					</div>
				</div>
			{/each}
		</div>

		<div class="min-h-72 border border-[#2a2a28] bg-[var(--sty-project-bg)]" style={projectAppearanceStyle(draft)}>
			<div class="border-b border-[var(--sty-project-border)] bg-[var(--sty-project-nav-bg)] px-3 py-2 text-[var(--sty-project-nav-fg)]">
				<div class="flex items-center gap-2 text-sm font-medium">
					<span>sty</span>
					<span class="text-[var(--sty-project-nav-muted)]">/</span>
					<span>{fields.length} colors</span>
				</div>
				<div class="mt-2 flex gap-3 text-xs text-[var(--sty-project-nav-muted)]">
					<span class="border-b-2 border-[var(--sty-project-accent)] pb-1 text-[var(--sty-project-nav-fg)]">Overview</span>
					<span>Code</span>
					<span>Issues</span>
				</div>
			</div>
			<div class="bg-[var(--sty-project-bg)] p-3">
				<div class="border border-[var(--sty-project-border)] bg-[var(--sty-project-surface)] p-3">
					<div class="text-sm font-semibold text-[var(--sty-project-fg)]">Preview</div>
					<div class="mt-1 text-xs text-[var(--sty-project-muted)]">Project pages use these colors.</div>
					<div class="mt-3 h-2 bg-[var(--sty-project-code-bg)]"></div>
					<div class="mt-3 flex items-center justify-between">
						<span class="text-xs text-[var(--sty-project-accent)]">Accent text</span>
						<span class="bg-[var(--sty-project-primary)] px-2 py-1 text-xs font-medium text-[var(--sty-project-primary-fg)]">Button</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="flex justify-end gap-2 border-t border-[#252522] pt-3">
		<button
			class="flex h-8 items-center gap-1.5 border border-[#2a2a28] px-2.5 text-xs text-[#8c887e] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
			onclick={() => applyPreset(DEFAULT_PROJECT_APPEARANCE)}
			disabled={busy || saving}
		>
			<RotateCcw class="h-3.5 w-3.5" /> Reset
		</button>
		<button
			class="flex h-8 items-center gap-1.5 bg-[#eae9e4] px-2.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50"
			onclick={save}
			disabled={busy || saving || invalid || !dirty}
		>
			<Check class="h-3.5 w-3.5" /> Save appearance
		</button>
	</div>
</div>
