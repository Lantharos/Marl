<script lang="ts">
	import type { ProjectApiKey, ProjectIntegration, ProjectWebhook } from '$lib/api';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import Check from 'lucide-svelte/icons/check';
	import Copy from 'lucide-svelte/icons/copy';
	import KeyRound from 'lucide-svelte/icons/key-round';
	import Link2 from 'lucide-svelte/icons/link-2';
	import PlugZap from 'lucide-svelte/icons/plug-zap';
	import Send from 'lucide-svelte/icons/send';
	import Trash2 from 'lucide-svelte/icons/trash-2';

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
		removeIntegration: (id: string) => void;
	} = $props();

	let copied = $state('');

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
</script>

<div class="grid gap-4">
	<SettingsSection title="API keys" description="Project-scoped tokens for tools, deployers, and agents." open>
		<div class="grid gap-3">
			<div class="grid gap-3 rounded bg-[#0f0f0d] p-3">
				<input class="h-9 rounded bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none" placeholder="Key name" bind:value={keyName} />
				<div class="grid gap-2">
					{#each scopeGroups as group}
						<div class="flex flex-wrap items-center gap-1.5">
							<div class="w-24 shrink-0 text-xs text-[#8c887e]">{group.label}</div>
							{#each group.options as scope}
								<button
									class="rounded border px-2.5 py-1 text-xs {keyScopes.includes(scope.id) ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
									onclick={() => (keyScopes = toggle(keyScopes, scope.id))}
								>
									{scope.label}
								</button>
							{/each}
						</div>
					{/each}
				</div>
				<button class="w-fit rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !keyName.trim()} onclick={addApiKey}>
					Create key
				</button>
			</div>

			{#if generatedKey?.token}
				<div class="rounded border border-[#2a2a28] bg-[#0f0f0d] p-3">
					<div class="mb-2 text-xs text-[#8c887e]">Copy this token now. It will not be shown again.</div>
					<div class="flex items-center gap-2">
						<code class="min-w-0 flex-1 overflow-x-auto rounded bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{generatedKey.token}</code>
						<button class="flex h-8 w-8 items-center justify-center rounded border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(generatedKey.token ?? '')} aria-label="Copy token">
							{#if copied === generatedKey.token}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
						</button>
					</div>
				</div>
			{/if}

			<div class="grid gap-1">
				{#each apiKeys as key}
					<div class="flex items-center gap-3 rounded bg-[#0f0f0d] px-3 py-2">
						<KeyRound class="h-4 w-4 shrink-0 text-[#8c887e]" />
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm text-[#eae9e4]">{key.name}</div>
							<div class="truncate font-mono text-[11px] text-[#6f6b5f]">{key.prefix}... / {key.scopes.join(' ')} / last used {date(key.last_used_at)}</div>
						</div>
						<button class="flex h-7 w-7 items-center justify-center rounded text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeApiKey(key.id)} aria-label="Delete API key">
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</div>
				{:else}
					<p class="text-sm text-[#6f6b5f]">No API keys.</p>
				{/each}
			</div>
		</div>
	</SettingsSection>

	<SettingsSection title="Webhooks" description="Send project events to another service." open>
		<div class="grid gap-3">
			<div class="grid gap-3 rounded bg-[#0f0f0d] p-3">
				<div class="grid gap-2 md:grid-cols-2">
					<input class="h-9 rounded bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none" placeholder="Webhook name" bind:value={webhookName} />
					<input class="h-9 rounded bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none" placeholder="https://example.com/webhook" bind:value={webhookUrl} />
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each events as event}
						<button
							class="rounded border px-2.5 py-1 font-mono text-[11px] {webhookEvents.includes(event) ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#8c887e] hover:text-[#eae9e4]'}"
							onclick={() => (webhookEvents = toggle(webhookEvents, event))}
						>
							{event}
						</button>
					{/each}
				</div>
				<button class="w-fit rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !webhookName.trim() || !webhookUrl.trim()} onclick={addWebhook}>
					Create webhook
				</button>
			</div>

			{#if testMessage}
				<div class="text-xs text-[#8c887e]">{testMessage}</div>
			{/if}

			{#if createdWebhook?.secret}
				<div class="rounded border border-[#2a2a28] bg-[#0f0f0d] p-3">
					<div class="mb-2 text-xs text-[#8c887e]">Copy this webhook secret now. It will not be shown again.</div>
					<div class="flex items-center gap-2">
						<code class="min-w-0 flex-1 overflow-x-auto rounded bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{createdWebhook.secret}</code>
						<button class="flex h-8 w-8 items-center justify-center rounded border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(createdWebhook.secret ?? '')} aria-label="Copy webhook secret">
							{#if copied === createdWebhook.secret}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
						</button>
					</div>
				</div>
			{/if}

			<div class="grid gap-1">
				{#each webhooks as hook}
					<div class="flex items-start gap-3 rounded bg-[#0f0f0d] px-3 py-2">
						<Send class="mt-0.5 h-4 w-4 shrink-0 text-[#8c887e]" />
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm text-[#eae9e4]">{hook.name}</div>
							<div class="truncate font-mono text-[11px] text-[#6f6b5f]">{hook.url}</div>
							<div class="mt-1 flex flex-wrap gap-1">
								{#each hook.events as event}
									<span class="font-mono text-[11px] text-[#8c887e]">{event}</span>
								{/each}
							</div>
						</div>
						<button class="flex h-7 w-7 items-center justify-center rounded text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => testWebhook(hook.id)} aria-label="Test webhook">
							<PlugZap class="h-3.5 w-3.5" />
						</button>
						<button class="flex h-7 w-7 items-center justify-center rounded text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeWebhook(hook.id)} aria-label="Delete webhook">
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</div>
				{:else}
					<p class="text-sm text-[#6f6b5f]">No webhooks.</p>
				{/each}
			</div>
		</div>
	</SettingsSection>

	<SettingsSection title="Connected apps" description="Apps installed through sty authorization.">
		<div class="grid gap-1">
			{#each integrations as app}
				<div class="flex items-center gap-3 rounded bg-[#0f0f0d] px-3 py-2">
					<Link2 class="h-4 w-4 shrink-0 text-[#8c887e]" />
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm text-[#eae9e4]">{app.app_name}</div>
						<div class="truncate text-[11px] text-[#6f6b5f]">{app.scopes.join(' ')}</div>
					</div>
					<button class="flex h-7 w-7 items-center justify-center rounded text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeIntegration(app.id)} aria-label="Disconnect app">
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			{:else}
				<p class="text-sm text-[#6f6b5f]">No connected apps.</p>
			{/each}
		</div>
	</SettingsSection>
</div>
