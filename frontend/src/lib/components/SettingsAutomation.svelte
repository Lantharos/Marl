<script lang="ts">
	import type { ProjectApiKey, ProjectIntegration, ProjectWebhook } from '$lib/api';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import Check from 'lucide-svelte/icons/check';
	import Copy from 'lucide-svelte/icons/copy';
	import KeyRound from 'lucide-svelte/icons/key-round';
	import Link2 from 'lucide-svelte/icons/link-2';
	import Play from 'lucide-svelte/icons/play';
	import PlugZap from 'lucide-svelte/icons/plug-zap';
	import Plus from 'lucide-svelte/icons/plus';
	import Send from 'lucide-svelte/icons/send';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import X from 'lucide-svelte/icons/x';

	const scopeGroups = [
		{
			label: 'Main',
			options: [
				{ id: 'main:read', label: 'Read' },
				{ id: 'main:write', label: 'Write' }
			]
		},
		{
			label: 'Workspaces',
			options: [
				{ id: 'workspaces:read', label: 'Read' },
				{ id: 'workspaces:create', label: 'Create' },
				{ id: 'workspaces:write', label: 'Write' },
				{ id: 'workspaces:ready', label: 'Ready' },
				{ id: 'workspaces:merge', label: 'Merge' }
			]
		},
		{
			label: 'Issues',
			options: [
				{ id: 'issues:read', label: 'Read' },
				{ id: 'issues:write', label: 'Write' }
			]
		},
		{
			label: 'Releases',
			options: [
				{ id: 'releases:read', label: 'Read' },
				{ id: 'releases:write', label: 'Write' }
			]
		},
		{
			label: 'Automation',
			options: [
				{ id: 'webhooks:read', label: 'Read webhooks' },
				{ id: 'webhooks:write', label: 'Write webhooks' },
				{ id: 'settings:read', label: 'Read settings' },
				{ id: 'settings:write', label: 'Write settings' }
			]
		}
	];

	const events = [
		'manual',
		'sync',
		'snapshot.saved',
		'snapshot.crammed',
		'snapshot.shipped',
		'workspace.ready',
		'workspace.merged',
		'release.created',
		'release.artifact_uploaded',
		'issue.created',
		'issue.updated'
	];

	let {
		apiKeys,
		webhooks,
		integrations,
		busy,
		generatedKey,
		createdWebhook,
		keyName = $bindable(),
		keyScopes = $bindable(),
		webhookName = $bindable(),
		webhookUrl = $bindable(),
		webhookEvents = $bindable(),
		testMessage,
		addApiKey,
		removeApiKey,
		addWebhook,
		removeWebhook,
		testWebhook,
		triggerWebhook,
		removeIntegration
	}: {
		apiKeys: ProjectApiKey[];
		webhooks: ProjectWebhook[];
		integrations: ProjectIntegration[];
		busy: boolean;
		generatedKey: ProjectApiKey | null;
		createdWebhook: ProjectWebhook | null;
		keyName: string;
		keyScopes: string[];
		webhookName: string;
		webhookUrl: string;
		webhookEvents: string[];
		testMessage: string;
		addApiKey: () => void;
		removeApiKey: (id: string) => void;
		addWebhook: () => void;
		removeWebhook: (id: string) => void;
		testWebhook: (id: string) => void;
		triggerWebhook: (id: string) => void;
		removeIntegration: (id: string) => void;
	} = $props();

	let copied = $state('');
	const activeWebhooks = $derived(webhooks.filter((hook) => hook.active));
	const failedWebhooks = $derived(activeWebhooks.filter((hook) => webhookFailed(hook)));
	let showKeyModal = $state(false);
	let showWebhookModal = $state(false);
	let keyCreatedInModal = $state(false);
	let webhookCreatedInModal = $state(false);

	function toggle(list: string[], value: string) {
		if (list.includes(value)) return list.filter((item) => item !== value);
		return [...list, value];
	}

	async function copy(value: string) {
		await navigator.clipboard?.writeText(value);
		copied = value;
		window.setTimeout(() => {
			if (copied === value) copied = '';
		}, 1400);
	}

	function date(value?: string | null) {
		return value ? new Date(value).toLocaleDateString() : 'Never';
	}

	function webhookFailed(hook: ProjectWebhook) {
		return Boolean(hook.last_delivery_status && (hook.last_delivery_status < 200 || hook.last_delivery_status >= 300));
	}

	function webhookStatusLabel(hook: ProjectWebhook) {
		if (!hook.last_delivery_at) return 'not delivered yet';
		if (!hook.last_delivery_status) return 'no response';
		if (webhookFailed(hook)) return `failing ${hook.last_delivery_status}`;
		return `healthy ${hook.last_delivery_status}`;
	}

	function webhookStatusClass(hook: ProjectWebhook) {
		if (!hook.last_delivery_at) return 'text-[#8c887e]';
		return webhookFailed(hook) ? 'text-[#d96c5a]' : 'text-[#7cb97c]';
	}

	function scopeSummary(scopes: string[]) {
		if (!scopes.length) return 'No scopes';
		const groups = new Set(scopes.map((scope) => scope.split(':')[0]));
		return [...groups].join(', ');
	}

	function closeKeyModal() {
		showKeyModal = false;
		keyName = '';
		keyCreatedInModal = false;
	}

	function closeWebhookModal() {
		showWebhookModal = false;
		webhookName = '';
		webhookUrl = '';
		webhookCreatedInModal = false;
	}

	function openKeyModal() {
		keyCreatedInModal = false;
		showKeyModal = true;
	}

	function openWebhookModal() {
		webhookCreatedInModal = false;
		showWebhookModal = true;
	}

	async function createKeyFromModal() {
		keyCreatedInModal = false;
		await addApiKey();
		keyCreatedInModal = true;
	}

	async function createWebhookFromModal() {
		webhookCreatedInModal = false;
		await addWebhook();
		webhookCreatedInModal = true;
	}
</script>

<div class="grid gap-4">
	{#if failedWebhooks.length}
		<div class="flex items-start gap-2 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">
			<AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
			<span>{failedWebhooks.length} webhook {failedWebhooks.length === 1 ? 'delivery is' : 'deliveries are'} failing. Test the endpoint or check its receiver logs.</span>
		</div>
	{/if}

	<SettingsSection title="API keys" open>
		{#snippet actions()}
			<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] px-2.5 text-xs text-[#eae9e4] hover:bg-[#2a2a28]" onclick={openKeyModal}>
				<Plus class="h-3.5 w-3.5" /> New key
			</button>
		{/snippet}
		<div class="grid gap-3">
			<div class="border border-[#252522] bg-[#0f0f0d]">
				{#each apiKeys as key (key.id)}
					<div class="flex items-center gap-3 border-b border-[#252522] px-3 py-2 last:border-b-0">
						<KeyRound class="h-4 w-4 shrink-0 text-[#8c887e]" />
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm text-[#eae9e4]">{key.name}</div>
							<div class="truncate text-[11px] text-[#6f6b5f]">
								<span class="font-mono">{key.prefix}...</span>
								<span> · {scopeSummary(key.scopes)}</span>
								<span> · last used {date(key.last_used_at)}</span>
							</div>
						</div>
						<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeApiKey(key.id)} aria-label="Delete API key">
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</div>
				{:else}
					<p class="px-3 py-3 text-sm text-[#6f6b5f]">No API keys.</p>
				{/each}
			</div>
		</div>
	</SettingsSection>

	<SettingsSection title="Webhooks" open>
		{#snippet actions()}
			<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] px-2.5 text-xs text-[#eae9e4] hover:bg-[#2a2a28]" onclick={openWebhookModal}>
				<Plus class="h-3.5 w-3.5" /> New webhook
			</button>
		{/snippet}
		<div class="grid gap-3">
			{#if testMessage}
				<div class="text-xs text-[#8c887e]">{testMessage}</div>
			{/if}

			<div class="border border-[#252522] bg-[#0f0f0d]">
				{#each webhooks as hook (hook.id)}
					<div class="flex items-start gap-3 border-b border-[#252522] px-3 py-2 last:border-b-0">
						<Send class="mt-0.5 h-4 w-4 shrink-0 text-[#8c887e]" />
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="truncate text-sm text-[#eae9e4]">{hook.name}</span>
								<span class="text-xs {webhookStatusClass(hook)}">{webhookStatusLabel(hook)}</span>
							</div>
							<div class="truncate font-mono text-[11px] text-[#6f6b5f]">{hook.url}</div>
							<div class="mt-1 flex flex-wrap gap-1.5">
								{#each hook.events as event (event)}
									<span class="font-mono text-[11px] text-[#8c887e]">{event}</span>
								{/each}
							</div>
						</div>
						{#if hook.events.includes('manual')}
							<button class="inline-flex h-7 items-center gap-1 border border-[#2a2a28] px-2 text-xs text-[#a09d94] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => triggerWebhook(hook.id)} aria-label="Trigger manual event">
								<Play class="h-3.5 w-3.5" /> Trigger
							</button>
						{/if}
						<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => testWebhook(hook.id)} aria-label="Test webhook">
							<PlugZap class="h-3.5 w-3.5" />
						</button>
						<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeWebhook(hook.id)} aria-label="Delete webhook">
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</div>
				{:else}
					<p class="px-3 py-3 text-sm text-[#6f6b5f]">No webhooks.</p>
				{/each}
			</div>
		</div>
	</SettingsSection>

	<SettingsSection title="Connected apps">
		<div class="border border-[#252522] bg-[#0f0f0d]">
			{#each integrations as app (app.id)}
				<div class="flex items-center gap-3 border-b border-[#252522] px-3 py-2 last:border-b-0">
					<Link2 class="h-4 w-4 shrink-0 text-[#8c887e]" />
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm text-[#eae9e4]">{app.app_name}</div>
						<div class="truncate text-[11px] text-[#6f6b5f]">{app.scopes.join(' ')}</div>
					</div>
					<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeIntegration(app.id)} aria-label="Disconnect app">
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			{:else}
				<p class="px-3 py-3 text-sm text-[#6f6b5f]">No connected apps.</p>
			{/each}
		</div>
	</SettingsSection>
</div>

{#if showKeyModal}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
		<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={closeKeyModal}></button>
		<div class="relative w-full max-w-xl border border-[#2a2a28] bg-[#141412] shadow-2xl shadow-black/40">
			<div class="flex h-12 items-center justify-between border-b border-[#252522] px-4">
				<div class="text-sm font-medium text-[#eae9e4]">New API key</div>
				<button class="-mr-4 flex h-12 w-12 items-center justify-center text-[#8c887e] hover:text-[#eae9e4]" onclick={closeKeyModal} aria-label="Close">
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="grid gap-3 p-4">
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Key name" bind:value={keyName} />
				<div class="grid gap-2">
					{#each scopeGroups as group (group.label)}
						<div class="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-1.5">
							<div class="w-24 shrink-0 text-xs text-[#8c887e]">{group.label}</div>
							<div class="flex flex-wrap gap-1.5">
								{#each group.options as scope (scope.id)}
									<button
										class="border px-2.5 py-1 text-xs {keyScopes.includes(scope.id) ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
										onclick={() => (keyScopes = toggle(keyScopes, scope.id))}
									>
										{scope.label}
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
				{#if keyCreatedInModal && generatedKey?.token}
					<div class="border border-[#2a2a28] bg-[#0f0f0d] p-3">
						<div class="mb-2 text-xs text-[#8c887e]">Copy this token now. It will not be shown again.</div>
						<div class="flex items-center gap-2">
							<code class="min-w-0 flex-1 overflow-x-auto bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{generatedKey.token}</code>
							<button class="flex h-8 w-8 items-center justify-center border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(generatedKey.token ?? '')} aria-label="Copy token">
								{#if copied === generatedKey.token}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
							</button>
						</div>
					</div>
				{/if}
			</div>
			<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
				<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={closeKeyModal}>Close</button>
				<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !keyName.trim()} onclick={createKeyFromModal}>Create key</button>
			</div>
		</div>
	</div>
{/if}

{#if showWebhookModal}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
		<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={closeWebhookModal}></button>
		<div class="relative w-full max-w-xl border border-[#2a2a28] bg-[#141412] shadow-2xl shadow-black/40">
			<div class="flex h-12 items-center justify-between border-b border-[#252522] px-4">
				<div class="text-sm font-medium text-[#eae9e4]">New webhook</div>
				<button class="-mr-4 flex h-12 w-12 items-center justify-center text-[#8c887e] hover:text-[#eae9e4]" onclick={closeWebhookModal} aria-label="Close">
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="grid gap-3 p-4">
				<div class="grid gap-2 md:grid-cols-2">
					<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Webhook name" bind:value={webhookName} />
					<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="https://example.com/webhook" bind:value={webhookUrl} />
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each events as event (event)}
						<button
							class="border px-2.5 py-1 font-mono text-[11px] {webhookEvents.includes(event) ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
							onclick={() => (webhookEvents = toggle(webhookEvents, event))}
						>
							{event}
						</button>
					{/each}
				</div>
				{#if webhookCreatedInModal && createdWebhook?.secret}
					<div class="border border-[#2a2a28] bg-[#0f0f0d] p-3">
						<div class="mb-2 text-xs text-[#8c887e]">Copy this webhook secret now. It will not be shown again.</div>
						<div class="flex items-center gap-2">
							<code class="min-w-0 flex-1 overflow-x-auto bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{createdWebhook.secret}</code>
							<button class="flex h-8 w-8 items-center justify-center border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(createdWebhook.secret ?? '')} aria-label="Copy webhook secret">
								{#if copied === createdWebhook.secret}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
							</button>
						</div>
					</div>
				{/if}
			</div>
			<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
				<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={closeWebhookModal}>Close</button>
				<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !webhookName.trim() || !webhookUrl.trim()} onclick={createWebhookFromModal}>Create webhook</button>
			</div>
		</div>
	</div>
{/if}
