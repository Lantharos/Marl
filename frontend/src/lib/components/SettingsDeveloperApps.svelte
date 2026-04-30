<script lang="ts">
	import type { DeveloperApp } from '$lib/api';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import Check from 'lucide-svelte/icons/check';
	import Copy from 'lucide-svelte/icons/copy';
	import Puzzle from 'lucide-svelte/icons/puzzle';
	import Trash2 from 'lucide-svelte/icons/trash-2';

	let {
		apps,
		busy,
		createdApp,
		appName = $bindable(),
		redirectUri = $bindable(),
		homepageUrl = $bindable(),
		description = $bindable(),
		addApp,
		removeApp
	}: {
		apps: DeveloperApp[];
		busy: boolean;
		createdApp: DeveloperApp | null;
		appName: string;
		redirectUri: string;
		homepageUrl: string;
		description: string;
		addApp: () => void;
		removeApp: (id: string) => void;
	} = $props();

	let copied = $state('');

	async function copy(value: string) {
		await navigator.clipboard?.writeText(value);
		copied = value;
		window.setTimeout(() => {
			if (copied === value) copied = '';
		}, 1400);
	}
</script>

<SettingsSection title="Developer apps" description="OAuth-style apps that can request access to projects." open>
	<div class="grid gap-3">
		<div class="grid gap-3 rounded bg-[#0f0f0d] p-3">
			<input class="h-9 rounded bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none" placeholder="App name" bind:value={appName} />
			<input class="h-9 rounded bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none" placeholder="Redirect URL" bind:value={redirectUri} />
			<input class="h-9 rounded bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none" placeholder="Homepage URL" bind:value={homepageUrl} />
			<textarea class="min-h-20 resize-y rounded bg-[#141412] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Description" bind:value={description}></textarea>
			<button class="w-fit rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !appName.trim() || !redirectUri.trim()} onclick={addApp}>
				Create app
			</button>
		</div>

		{#if createdApp?.client_secret}
			<div class="rounded border border-[#2a2a28] bg-[#0f0f0d] p-3">
				<div class="mb-2 text-xs text-[#8c887e]">Copy the client secret now. It will not be shown again.</div>
				<div class="grid gap-2">
					<div class="flex items-center gap-2">
						<code class="min-w-0 flex-1 overflow-x-auto rounded bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{createdApp.client_id}</code>
						<button class="flex h-8 w-8 items-center justify-center rounded border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(createdApp.client_id)} aria-label="Copy client ID">
							{#if copied === createdApp.client_id}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
						</button>
					</div>
					<div class="flex items-center gap-2">
						<code class="min-w-0 flex-1 overflow-x-auto rounded bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{createdApp.client_secret}</code>
						<button class="flex h-8 w-8 items-center justify-center rounded border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(createdApp.client_secret ?? '')} aria-label="Copy client secret">
							{#if copied === createdApp.client_secret}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<div class="grid gap-1">
			{#each apps as app}
				<div class="flex items-start gap-3 rounded bg-[#0f0f0d] px-3 py-2">
					<Puzzle class="mt-0.5 h-4 w-4 shrink-0 text-[#8c887e]" />
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm text-[#eae9e4]">{app.name}</div>
						<div class="truncate font-mono text-[11px] text-[#6f6b5f]">{app.client_id}</div>
						<div class="truncate text-[11px] text-[#6f6b5f]">{app.redirect_uri}</div>
					</div>
					<button class="flex h-7 w-7 items-center justify-center rounded text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeApp(app.id)} aria-label="Delete developer app">
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			{:else}
				<p class="text-sm text-[#6f6b5f]">No developer apps.</p>
			{/each}
		</div>
	</div>
</SettingsSection>
