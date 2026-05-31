<script lang="ts">
	import type { CiArtifact, CiJob, CiLogLine, CiRunner, CiSecret, ProjectCiSettings } from '$lib/api';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import SwitchControl from '$lib/components/SwitchControl.svelte';
	import Archive from 'lucide-svelte/icons/archive';
	import Check from 'lucide-svelte/icons/check';
	import CircleDot from 'lucide-svelte/icons/circle-dot';
	import Clock from 'lucide-svelte/icons/clock';
	import Copy from 'lucide-svelte/icons/copy';
	import Download from 'lucide-svelte/icons/download';
	import FileText from 'lucide-svelte/icons/file-text';
	import Gauge from 'lucide-svelte/icons/gauge';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Plus from 'lucide-svelte/icons/plus';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Server from 'lucide-svelte/icons/server';
	import Shield from 'lucide-svelte/icons/shield';
	import Terminal from 'lucide-svelte/icons/terminal';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Upload from 'lucide-svelte/icons/upload';
	import X from 'lucide-svelte/icons/x';

	type CiImportCommand = {
		name?: unknown;
		run?: unknown;
		timeout_seconds?: unknown;
		workspaces?: unknown;
		paths?: unknown;
		labels?: unknown;
		env?: unknown;
		secrets?: unknown;
		artifacts?: unknown;
		cache?: unknown;
	};

	type CiImportPayload = {
		commands?: unknown;
	};

	let {
		runners,
		ciJobs,
		ciArtifactsByJob,
		ciLogsByJob,
		ciSecrets,
		ci,
		busy,
		createdRunner,
		runnerName = $bindable(),
		runnerConcurrency = $bindable(),
		runnerLabels = $bindable(),
		ciCommandName = $bindable(),
		ciCommandRun = $bindable(),
		ciCommandTimeout = $bindable(),
		ciCommandArtifacts = $bindable(),
		ciCommandCaches = $bindable(),
		ciCommandWorkspaces = $bindable(),
		ciCommandPaths = $bindable(),
		ciCommandLabels = $bindable(),
		ciCommandEnv = $bindable(),
		ciCommandSecrets = $bindable(),
		ciSecretKey = $bindable(),
		ciSecretValue = $bindable(),
		loadCiArtifacts,
		loadCiLogs,
		downloadCiArtifact,
		cancelJob,
		rerunJob,
		saveCiSecret,
		removeCiSecret,
		toggleCi,
		saveCiSettings,
		addCiCommand,
		removeCiCommand,
		addRunner,
		removeRunner
	}: {
		runners: CiRunner[];
		ciJobs: CiJob[];
		ciArtifactsByJob: Record<string, CiArtifact[]>;
		ciLogsByJob: Record<string, CiLogLine[]>;
		ciSecrets: CiSecret[];
		ci: ProjectCiSettings;
		busy: boolean;
		createdRunner: CiRunner | null;
		runnerName: string;
		runnerConcurrency: number;
		runnerLabels: string;
		ciCommandName: string;
		ciCommandRun: string;
		ciCommandTimeout: number;
		ciCommandArtifacts: string;
		ciCommandCaches: string;
		ciCommandWorkspaces: string;
		ciCommandPaths: string;
		ciCommandLabels: string;
		ciCommandEnv: string;
		ciCommandSecrets: string;
		ciSecretKey: string;
		ciSecretValue: string;
		loadCiArtifacts: (jobId: string) => void | Promise<void>;
		loadCiLogs: (jobId: string) => void | Promise<void>;
		downloadCiArtifact: (jobId: string, artifact: CiArtifact) => void | Promise<void>;
		cancelJob: (jobId: string) => void | Promise<void>;
		rerunJob: (jobId: string) => void | Promise<void>;
		saveCiSecret: () => void | Promise<void>;
		removeCiSecret: (key: string) => void | Promise<void>;
		toggleCi: () => void | Promise<void>;
		saveCiSettings: (ci: ProjectCiSettings) => void | Promise<void>;
		addCiCommand: () => void | Promise<void>;
		removeCiCommand: (name: string) => void | Promise<void>;
		addRunner: () => void | Promise<void>;
		removeRunner: (id: string) => void | Promise<void>;
	} = $props();

	let copied = $state('');
	let showRunnerModal = $state(false);
	let showCommandModal = $state(false);
	let showImportModal = $state(false);
	let runnerCreatedInModal = $state(false);
	let ciImportText = $state('');
	let ciImportError = $state('');
	const ciImportPlaceholder = '{"commands":[{"name":"CI / test","run":"bun test","timeout_seconds":900}]}';
	const commandTemplates = [
		{
			name: 'Bun test',
			run: 'bun install --frozen-lockfile\nbun test',
			artifacts: '',
			caches: 'bun-cache=.bun/install/cache'
		},
		{
			name: 'Svelte check',
			run: 'bun install --frozen-lockfile\nbun run check',
			artifacts: '',
			caches: 'bun-cache=.bun/install/cache'
		},
		{
			name: 'Rust check',
			run: 'cargo check --all-targets\ncargo test',
			artifacts: '',
			caches: 'cargo-registry=.cargo/registry, cargo-target=target'
		}
	];
	const activeRunners = $derived(runners.filter((runner) => !runner.disabled_at));
	const runningJobs = $derived(ciJobs.filter((job) => job.status === 'in_progress').length);
	const queuedJobs = $derived(ciJobs.filter((job) => job.status === 'queued').length);
	const runnerSetupCommand = $derived(createdRunner?.token ? `STY_CI_TOKEN=${createdRunner.token} pig ci run` : '');

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

	function closeRunnerModal() {
		showRunnerModal = false;
		runnerName = '';
		runnerConcurrency = 1;
		runnerLabels = '';
		runnerCreatedInModal = false;
	}

	function closeCommandModal() {
		showCommandModal = false;
		ciCommandName = '';
		ciCommandRun = '';
		ciCommandTimeout = 900;
		ciCommandArtifacts = '';
		ciCommandCaches = '';
		ciCommandWorkspaces = '';
		ciCommandPaths = '';
		ciCommandLabels = '';
		ciCommandEnv = '';
		ciCommandSecrets = '';
	}

	function closeImportModal() {
		showImportModal = false;
		ciImportText = '';
		ciImportError = '';
	}

	function openRunnerModal() {
		runnerCreatedInModal = false;
		showRunnerModal = true;
	}

	function openCommandModal() {
		showCommandModal = true;
	}

	function openImportModal() {
		ciImportError = '';
		showImportModal = true;
	}

	function applyTemplate(template: (typeof commandTemplates)[number]) {
		ciCommandName = template.name;
		ciCommandRun = template.run;
		ciCommandArtifacts = template.artifacts;
		ciCommandCaches = template.caches;
		ciCommandWorkspaces = '';
		ciCommandPaths = '';
		ciCommandLabels = '';
		ciCommandEnv = '';
		ciCommandSecrets = '';
		ciCommandTimeout = 900;
	}

	function editCommand(command: ProjectCiSettings['commands'][number]) {
		ciCommandName = command.name;
		ciCommandRun = command.run;
		ciCommandTimeout = command.timeout_seconds;
		ciCommandArtifacts = command.artifacts?.join(', ') ?? '';
		ciCommandCaches = command.cache?.map((entry) => `${entry.key}=${entry.path}`).join(', ') ?? '';
		ciCommandWorkspaces = command.workspaces?.join(', ') ?? '';
		ciCommandPaths = command.paths?.join(', ') ?? '';
		ciCommandLabels = command.labels?.join(', ') ?? '';
		ciCommandEnv = command.env?.map((entry) => `${entry.key}=${entry.value}`).join(', ') ?? '';
		ciCommandSecrets = command.secrets?.join(', ') ?? '';
		showCommandModal = true;
	}

	function updateTimeout(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		ciCommandTimeout = Number.isFinite(value) ? value : 900;
	}

	function updateRunnerConcurrency(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		runnerConcurrency = Number.isFinite(value) ? value : 1;
	}

	function updateCiLimit(key: keyof ProjectCiSettings, event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		saveCiSettings({ ...ci, [key]: Math.max(1, Math.floor(value)) });
	}

	async function createRunnerFromModal() {
		runnerCreatedInModal = false;
		await addRunner();
		runnerCreatedInModal = true;
	}

	async function createCommandFromModal() {
		await addCiCommand();
		closeCommandModal();
	}

	async function importDetectedCommands() {
		ciImportError = '';
		let payload: CiImportPayload;
		try {
			payload = JSON.parse(ciImportText) as CiImportPayload;
		} catch {
			ciImportError = 'Paste valid JSON from pig ci detect --json.';
			return;
		}
		if (!Array.isArray(payload.commands)) {
			ciImportError = 'The JSON must include a commands array.';
			return;
		}
		const imported = payload.commands
			.map(normalizeImportCommand)
			.filter((command): command is ProjectCiSettings['commands'][number] => Boolean(command));
		if (!imported.length) {
			ciImportError = 'No runnable commands were found.';
			return;
		}
		const importedNames = new Set(imported.map((command) => command.name));
		await saveCiSettings({
			...ci,
			commands: [...ci.commands.filter((command) => !importedNames.has(command.name)), ...imported]
		});
		closeImportModal();
	}

	function normalizeImportCommand(value: unknown): ProjectCiSettings['commands'][number] | null {
		if (!value || typeof value !== 'object') return null;
		const command = value as CiImportCommand;
		if (typeof command.name !== 'string' || typeof command.run !== 'string') return null;
		const name = command.name.trim();
		const run = command.run.trim();
		if (!name || !run) return null;
		return {
			name,
			run,
			timeout_seconds: numericImportValue(command.timeout_seconds, 900, 1, 14400),
			workspaces: stringListImportValue(command.workspaces),
			paths: stringListImportValue(command.paths),
			labels: stringListImportValue(command.labels),
			env: envImportValue(command.env),
			secrets: stringListImportValue(command.secrets),
			artifacts: stringListImportValue(command.artifacts),
			cache: cacheImportValue(command.cache)
		};
	}

	function numericImportValue(value: unknown, fallback: number, min: number, max: number) {
		const parsed = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(parsed)) return fallback;
		return Math.max(min, Math.min(max, Math.floor(parsed)));
	}

	function stringListImportValue(value: unknown) {
		if (!Array.isArray(value)) return [];
		return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
	}

	function cacheImportValue(value: unknown) {
		if (!Array.isArray(value)) return [];
		return value
			.map((entry) => {
				if (!entry || typeof entry !== 'object') return null;
				const candidate = entry as { key?: unknown; path?: unknown };
				if (typeof candidate.key !== 'string' || typeof candidate.path !== 'string') return null;
				const key = candidate.key.trim();
				const path = candidate.path.trim();
				return key && path ? { key, path } : null;
			})
			.filter((entry): entry is { key: string; path: string } => Boolean(entry));
	}

	function envImportValue(value: unknown) {
		if (!Array.isArray(value)) return [];
		return value
			.map((entry) => {
				if (!entry || typeof entry !== 'object') return null;
				const candidate = entry as { key?: unknown; value?: unknown };
				if (typeof candidate.key !== 'string' || typeof candidate.value !== 'string') return null;
				const key = candidate.key.trim();
				const envValue = candidate.value.trim();
				return key && envValue ? { key, value: envValue } : null;
			})
			.filter((entry): entry is { key: string; value: string } => Boolean(entry));
	}

	function jobLabel(job: CiJob) {
		if (job.status !== 'completed') return job.status.replace('_', ' ');
		return job.conclusion ?? 'completed';
	}

	function jobClass(job: CiJob) {
		if (job.status !== 'completed') return 'text-[#d9a66c]';
		if (job.conclusion === 'success' || job.conclusion === 'skipped') return 'text-[#7cb97c]';
		return 'text-[#d96c5a]';
	}

	function formatBytes(value: number) {
		if (value < 1024) return `${value} B`;
		if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
		return `${(value / 1024 / 1024).toFixed(1)} MB`;
	}

	function logText(lines: CiLogLine[]) {
		return lines.map((line) => line.text).join('');
	}

	function runnerActiveJobs(runnerId: string) {
		return ciJobs.filter((job) => job.runner_id === runnerId && job.status === 'in_progress').length;
	}

	function runnerHealth(runner: CiRunner) {
		if (runner.disabled_at) return 'disabled';
		if (!runner.last_seen_at) return 'never seen';
		const age = Date.now() - new Date(runner.last_seen_at).getTime();
		if (!Number.isFinite(age)) return 'unknown';
		if (age < 2 * 60 * 1000) return 'online';
		if (age < 15 * 60 * 1000) return 'stale';
		return 'offline';
	}

	function runnerHealthClass(runner: CiRunner) {
		const health = runnerHealth(runner);
		if (health === 'online') return 'text-[#7cb97c]';
		if (health === 'stale') return 'text-[#d9a66c]';
		if (health === 'offline') return 'text-[#d96c5a]';
		return 'text-[#6f6b5f]';
	}
</script>

<SettingsSection title="CI" open>
	{#snippet actions()}
		<div class="flex items-center gap-2">
			<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] px-2.5 text-xs text-[#eae9e4] hover:bg-[#2a2a28]" onclick={openCommandModal}>
				<Plus class="h-3.5 w-3.5" /> Command
			</button>
			<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] px-2.5 text-xs text-[#eae9e4] hover:bg-[#2a2a28]" onclick={openImportModal}>
				<Upload class="h-3.5 w-3.5" /> Import
			</button>
			<SwitchControl checked={ci.enabled} disabled={busy || !ci.commands.length} label="Toggle CI" onToggle={toggleCi} />
		</div>
	{/snippet}
	<div class="grid gap-3">
		<div class="grid gap-2 md:grid-cols-4">
			<div class="border border-[#252522] bg-[#0f0f0d] px-3 py-2">
				<div class="text-[11px] text-[#6f6b5f]">Commands</div>
				<div class="mt-1 text-lg font-medium text-[#eae9e4]">{ci.commands.length}</div>
			</div>
			<div class="border border-[#252522] bg-[#0f0f0d] px-3 py-2">
				<div class="text-[11px] text-[#6f6b5f]">Runners</div>
				<div class="mt-1 text-lg font-medium text-[#eae9e4]">{activeRunners.length}</div>
			</div>
			<div class="border border-[#252522] bg-[#0f0f0d] px-3 py-2">
				<div class="text-[11px] text-[#6f6b5f]">Running</div>
				<div class="mt-1 text-lg font-medium text-[#eae9e4]">{runningJobs}</div>
			</div>
			<div class="border border-[#252522] bg-[#0f0f0d] px-3 py-2">
				<div class="text-[11px] text-[#6f6b5f]">Queued</div>
				<div class="mt-1 text-lg font-medium text-[#eae9e4]">{queuedJobs}</div>
			</div>
		</div>

		<div class="border border-[#252522] bg-[#0f0f0d] px-3 py-3">
			<div class="mb-3 flex items-center gap-2 text-sm text-[#eae9e4]">
				<Gauge class="h-4 w-4 text-[#8c887e]" />
				<span>Limits</span>
			</div>
			<div class="grid gap-2 md:grid-cols-5">
				<label class="grid gap-1 text-[11px] text-[#8c887e]">
					<span>Project jobs</span>
					<input class="h-8 border border-[#2a2a28] bg-[#141412] px-2 text-sm text-[#eae9e4] outline-none focus:border-[#d9a66c] focus-visible:outline-none" inputmode="numeric" value={ci.max_concurrent_jobs ?? 8} disabled={busy} onblur={(event) => updateCiLimit('max_concurrent_jobs', event)} />
				</label>
				<label class="grid gap-1 text-[11px] text-[#8c887e]">
					<span>Jobs per head</span>
					<input class="h-8 border border-[#2a2a28] bg-[#141412] px-2 text-sm text-[#eae9e4] outline-none focus:border-[#d9a66c] focus-visible:outline-none" inputmode="numeric" value={ci.max_jobs_per_head ?? 50} disabled={busy} onblur={(event) => updateCiLimit('max_jobs_per_head', event)} />
				</label>
				<label class="grid gap-1 text-[11px] text-[#8c887e]">
					<span>Attempts</span>
					<input class="h-8 border border-[#2a2a28] bg-[#141412] px-2 text-sm text-[#eae9e4] outline-none focus:border-[#d9a66c] focus-visible:outline-none" inputmode="numeric" value={ci.max_attempts ?? 3} disabled={busy} onblur={(event) => updateCiLimit('max_attempts', event)} />
				</label>
				<label class="grid gap-1 text-[11px] text-[#8c887e]">
					<span>Artifacts days</span>
					<input class="h-8 border border-[#2a2a28] bg-[#141412] px-2 text-sm text-[#eae9e4] outline-none focus:border-[#d9a66c] focus-visible:outline-none" inputmode="numeric" value={ci.artifact_retention_days ?? 30} disabled={busy} onblur={(event) => updateCiLimit('artifact_retention_days', event)} />
				</label>
				<label class="grid gap-1 text-[11px] text-[#8c887e]">
					<span>Cache days</span>
					<input class="h-8 border border-[#2a2a28] bg-[#141412] px-2 text-sm text-[#eae9e4] outline-none focus:border-[#d9a66c] focus-visible:outline-none" inputmode="numeric" value={ci.cache_retention_days ?? 30} disabled={busy} onblur={(event) => updateCiLimit('cache_retention_days', event)} />
				</label>
			</div>
		</div>

		<div class="border border-[#252522] bg-[#0f0f0d]">
			<div class="flex items-center gap-2 border-b border-[#252522] px-3 py-2 text-sm text-[#eae9e4]">
				<Shield class="h-4 w-4 text-[#8c887e]" />
				<span>Secrets</span>
			</div>
			<div class="grid gap-2 border-b border-[#252522] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="TOKEN" bind:value={ciSecretKey} />
				<input class="h-9 border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Value" type="password" bind:value={ciSecretValue} />
				<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !ciSecretKey.trim() || !ciSecretValue} onclick={saveCiSecret}>Save</button>
			</div>
			{#each ciSecrets as secret (secret.key)}
				<div class="flex items-center gap-3 border-b border-[#252522] px-3 py-2 last:border-b-0">
					<div class="min-w-0 flex-1">
						<div class="truncate font-mono text-xs text-[#eae9e4]">{secret.key}</div>
						<div class="truncate text-[11px] text-[#6f6b5f]">Updated {date(secret.updated_at)}</div>
					</div>
					<div class="font-mono text-xs text-[#6f6b5f]">***</div>
					<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeCiSecret(secret.key)} aria-label="Delete CI secret">
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			{:else}
				<p class="px-3 py-3 text-sm text-[#6f6b5f]">No CI secrets.</p>
			{/each}
		</div>

		<div class="border border-[#252522] bg-[#0f0f0d]">
			{#each ci.commands as command (command.name)}
				<div class="flex items-start gap-3 border-b border-[#252522] px-3 py-2 last:border-b-0">
					<Terminal class="mt-0.5 h-4 w-4 shrink-0 text-[#8c887e]" />
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm text-[#eae9e4]">{command.name}</div>
						<div class="truncate font-mono text-[11px] text-[#6f6b5f]">{command.run}</div>
						<div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#6f6b5f]">
							<span class="inline-flex items-center gap-1"><Clock class="h-3 w-3" /> {command.timeout_seconds}s</span>
							{#if command.artifacts?.length}
								<span class="inline-flex items-center gap-1"><Archive class="h-3 w-3" /> {command.artifacts.length} {command.artifacts.length === 1 ? 'artifact' : 'artifacts'}</span>
							{/if}
							{#if command.cache?.length}
								<span>{command.cache.length} {command.cache.length === 1 ? 'cache' : 'caches'}</span>
							{/if}
							{#if command.labels?.length}
								<span>labels {command.labels.join(', ')}</span>
							{/if}
							{#if command.env?.length}
								<span>env {command.env.length}</span>
							{/if}
							{#if command.secrets?.length}
								<span>secrets {command.secrets.join(', ')}</span>
							{/if}
						</div>
					</div>
					<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => editCommand(command)} aria-label="Edit CI command">
						<Pencil class="h-3.5 w-3.5" />
					</button>
					<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => removeCiCommand(command.name)} aria-label="Delete CI command">
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			{:else}
				<p class="px-3 py-3 text-sm text-[#6f6b5f]">No CI commands.</p>
			{/each}
		</div>

		<div class="border border-[#252522] bg-[#0f0f0d]">
			{#each ciJobs as job (job.id)}
				<div class="border-b border-[#252522] last:border-b-0">
					<div class="flex items-center gap-3 px-3 py-2">
						<CircleDot class="h-4 w-4 shrink-0 {jobClass(job)}" />
						<div class="min-w-0 flex-1">
								<div class="truncate text-sm text-[#eae9e4]">{job.name} <span class="{jobClass(job)}">· {jobLabel(job)}</span></div>
								<div class="truncate text-[11px] text-[#6f6b5f]">{job.workspace} · {job.head.slice(0, 12)} · {date(job.updated_at)}</div>
								{#if job.summary && (job.status === 'queued' || job.status === 'in_progress')}
									<div class="truncate text-[11px] text-[#8c887e]">{job.summary}</div>
								{/if}
							</div>
						{#if job.status === 'queued' || job.status === 'in_progress'}
							<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy} onclick={() => cancelJob(job.id)} aria-label="Cancel CI job">
								<X class="h-3.5 w-3.5" />
							</button>
						{/if}
						<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => rerunJob(job.id)} aria-label="Rerun CI job">
							<RotateCcw class="h-3.5 w-3.5" />
						</button>
						<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => loadCiLogs(job.id)} aria-label="Load CI logs">
							<FileText class="h-3.5 w-3.5" />
						</button>
						<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => loadCiArtifacts(job.id)} aria-label="Load CI artifacts">
							<Download class="h-3.5 w-3.5" />
						</button>
					</div>
					{#if ciLogsByJob[job.id]}
						<div class="border-t border-[#1f1f1c] px-10 py-2">
							<pre class="max-h-64 overflow-auto whitespace-pre-wrap bg-[#141412] p-3 font-mono text-[11px] leading-5 text-[#a09d94]">{logText(ciLogsByJob[job.id]) || 'No logs.'}</pre>
						</div>
					{/if}
					{#if ciArtifactsByJob[job.id]}
						<div class="border-t border-[#1f1f1c] px-10 py-2">
							{#each ciArtifactsByJob[job.id] as artifact (artifact.id)}
								<div class="grid items-center gap-2 py-1 text-[11px] md:grid-cols-[minmax(0,1fr)_5rem_8rem_2rem]">
									<div class="min-w-0">
										<div class="truncate text-[#a09d94]">{artifact.name}</div>
										<div class="truncate font-mono text-[#6f6b5f]">{artifact.digest}</div>
									</div>
									<div class="text-[#8c887e]">{formatBytes(artifact.size)}</div>
									<div class="text-[#6f6b5f]">{date(artifact.created_at)}</div>
									<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => downloadCiArtifact(job.id, artifact)} aria-label="Download CI artifact">
										<Download class="h-3.5 w-3.5" />
									</button>
								</div>
							{:else}
								<div class="py-1 text-xs text-[#6f6b5f]">No artifacts.</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<p class="px-3 py-3 text-sm text-[#6f6b5f]">No CI jobs yet.</p>
			{/each}
		</div>
	</div>
</SettingsSection>

<SettingsSection title="CI runners">
	{#snippet actions()}
		<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] px-2.5 text-xs text-[#eae9e4] hover:bg-[#2a2a28]" onclick={openRunnerModal}>
			<Plus class="h-3.5 w-3.5" /> Runner
		</button>
	{/snippet}
	<div class="border border-[#252522] bg-[#0f0f0d]">
		{#each runners as runner (runner.id)}
			<div class="flex items-center gap-3 border-b border-[#252522] px-3 py-2 last:border-b-0">
				<Server class="h-4 w-4 shrink-0 text-[#8c887e]" />
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm text-[#eae9e4]">{runner.name}</div>
					<div class="truncate text-[11px] text-[#6f6b5f]">
							<span class="font-mono">{runner.prefix}...</span>
							<span class={runnerHealthClass(runner)}> · {runnerHealth(runner)}</span>
							<span> · concurrency {runner.concurrency}</span>
						<span> · active {runnerActiveJobs(runner.id)}</span>
						<span> · last seen {date(runner.last_seen_at)}</span>
						{#if runner.labels?.length}<span> · labels {runner.labels.join(', ')}</span>{/if}
						{#if runner.disabled_at}<span> · disabled</span>{/if}
					</div>
				</div>
				<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#d96c5a]" disabled={busy || Boolean(runner.disabled_at)} onclick={() => removeRunner(runner.id)} aria-label="Disable CI runner">
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			</div>
		{:else}
			<p class="px-3 py-3 text-sm text-[#6f6b5f]">No CI runners.</p>
		{/each}
	</div>
</SettingsSection>

{#if showRunnerModal}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
		<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={closeRunnerModal}></button>
		<div class="relative w-full max-w-xl border border-[#2a2a28] bg-[#141412] shadow-2xl shadow-black/40">
			<div class="flex h-12 items-center justify-between border-b border-[#252522] px-4">
				<div class="text-sm font-medium text-[#eae9e4]">New CI runner</div>
				<button class="-mr-4 flex h-12 w-12 items-center justify-center text-[#8c887e] hover:text-[#eae9e4]" onclick={closeRunnerModal} aria-label="Close">
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="grid gap-3 p-4">
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Runner name" bind:value={runnerName} />
				<label class="grid gap-1 text-xs text-[#8c887e]">
					<span>Concurrency</span>
					<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" inputmode="numeric" value={runnerConcurrency} oninput={updateRunnerConcurrency} />
				</label>
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Labels: linux, rust" bind:value={runnerLabels} />
				{#if runnerCreatedInModal && createdRunner?.token}
					<div class="border border-[#2a2a28] bg-[#0f0f0d] p-3">
						<div class="mb-2 text-xs text-[#8c887e]">Copy this runner token now. It will not be shown again.</div>
						<div class="flex items-center gap-2">
							<code class="min-w-0 flex-1 overflow-x-auto bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{createdRunner.token}</code>
							<button class="flex h-8 w-8 items-center justify-center border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(createdRunner.token ?? '')} aria-label="Copy runner token">
								{#if copied === createdRunner.token}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
							</button>
						</div>
						<div class="mt-3 flex items-center gap-2">
							<code class="min-w-0 flex-1 overflow-x-auto bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{runnerSetupCommand}</code>
							<button class="flex h-8 w-8 items-center justify-center border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(runnerSetupCommand)} aria-label="Copy runner command">
								{#if copied === runnerSetupCommand}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
							</button>
						</div>
					</div>
				{/if}
			</div>
			<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
				<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={closeRunnerModal}>Close</button>
				<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !runnerName.trim()} onclick={createRunnerFromModal}>Create runner</button>
			</div>
		</div>
	</div>
{/if}

{#if showImportModal}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
		<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={closeImportModal}></button>
		<div class="relative w-full max-w-2xl border border-[#2a2a28] bg-[#141412] shadow-2xl shadow-black/40">
			<div class="flex h-12 items-center justify-between border-b border-[#252522] px-4">
				<div class="text-sm font-medium text-[#eae9e4]">Import CI commands</div>
				<button class="-mr-4 flex h-12 w-12 items-center justify-center text-[#8c887e] hover:text-[#eae9e4]" onclick={closeImportModal} aria-label="Close">
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="grid gap-3 p-4">
				<textarea class="min-h-64 border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder={ciImportPlaceholder} bind:value={ciImportText}></textarea>
				{#if ciImportError}
					<div class="text-xs text-[#d96c5a]">{ciImportError}</div>
				{/if}
			</div>
			<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
				<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={closeImportModal}>Cancel</button>
				<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !ciImportText.trim()} onclick={importDetectedCommands}>Import commands</button>
			</div>
		</div>
	</div>
{/if}

{#if showCommandModal}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
		<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={closeCommandModal}></button>
		<div class="relative w-full max-w-xl border border-[#2a2a28] bg-[#141412] shadow-2xl shadow-black/40">
			<div class="flex h-12 items-center justify-between border-b border-[#252522] px-4">
				<div class="text-sm font-medium text-[#eae9e4]">New CI command</div>
				<button class="-mr-4 flex h-12 w-12 items-center justify-center text-[#8c887e] hover:text-[#eae9e4]" onclick={closeCommandModal} aria-label="Close">
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="grid gap-3 p-4">
				<div class="flex flex-wrap gap-1.5">
					{#each commandTemplates as template (template.name)}
						<button class="border border-[#2a2a28] px-2.5 py-1 text-xs text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={() => applyTemplate(template)}>
							{template.name}
						</button>
					{/each}
				</div>
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Name" bind:value={ciCommandName} />
				<textarea class="min-h-28 border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="bun install --frozen-lockfile&#10;bun test" bind:value={ciCommandRun}></textarea>
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Timeout seconds" inputmode="numeric" value={ciCommandTimeout} oninput={updateTimeout} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Artifacts: dist, coverage/lcov.info" bind:value={ciCommandArtifacts} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Caches: bun-cache=.bun/install/cache" bind:value={ciCommandCaches} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Workspaces: main, release/*" bind:value={ciCommandWorkspaces} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Paths: src/**, package.json" bind:value={ciCommandPaths} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Runner labels: linux, rust" bind:value={ciCommandLabels} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Env: NODE_ENV=test, RUST_BACKTRACE=1" bind:value={ciCommandEnv} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Secrets: NPM_TOKEN, CARGO_TOKEN" bind:value={ciCommandSecrets} />
			</div>
			<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
				<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={closeCommandModal}>Close</button>
				<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !ciCommandName.trim() || !ciCommandRun.trim()} onclick={createCommandFromModal}>Save command</button>
			</div>
		</div>
	</div>
{/if}
