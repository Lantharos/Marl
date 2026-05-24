<script lang="ts">
	import type { CiArtifact, CiJob, CiRunner, ProjectCiSettings } from '$lib/api';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import SwitchControl from '$lib/components/SwitchControl.svelte';
	import Archive from 'lucide-svelte/icons/archive';
	import Check from 'lucide-svelte/icons/check';
	import CircleDot from 'lucide-svelte/icons/circle-dot';
	import Clock from 'lucide-svelte/icons/clock';
	import Copy from 'lucide-svelte/icons/copy';
	import Download from 'lucide-svelte/icons/download';
	import Plus from 'lucide-svelte/icons/plus';
	import Server from 'lucide-svelte/icons/server';
	import Terminal from 'lucide-svelte/icons/terminal';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import X from 'lucide-svelte/icons/x';

	let {
		runners,
		ciJobs,
		ciArtifactsByJob,
		ci,
		busy,
		createdRunner,
		runnerName = $bindable(),
		ciCommandName = $bindable(),
		ciCommandRun = $bindable(),
		ciCommandTimeout = $bindable(),
		ciCommandArtifacts = $bindable(),
		ciCommandCaches = $bindable(),
		loadCiArtifacts,
		downloadCiArtifact,
		toggleCi,
		addCiCommand,
		removeCiCommand,
		addRunner,
		removeRunner
	}: {
		runners: CiRunner[];
		ciJobs: CiJob[];
		ciArtifactsByJob: Record<string, CiArtifact[]>;
		ci: ProjectCiSettings;
		busy: boolean;
		createdRunner: CiRunner | null;
		runnerName: string;
		ciCommandName: string;
		ciCommandRun: string;
		ciCommandTimeout: number;
		ciCommandArtifacts: string;
		ciCommandCaches: string;
		loadCiArtifacts: (jobId: string) => void | Promise<void>;
		downloadCiArtifact: (jobId: string, artifact: CiArtifact) => void | Promise<void>;
		toggleCi: () => void | Promise<void>;
		addCiCommand: () => void | Promise<void>;
		removeCiCommand: (name: string) => void | Promise<void>;
		addRunner: () => void | Promise<void>;
		removeRunner: (id: string) => void | Promise<void>;
	} = $props();

	let copied = $state('');
	let showRunnerModal = $state(false);
	let showCommandModal = $state(false);
	let runnerCreatedInModal = $state(false);

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
		runnerCreatedInModal = false;
	}

	function closeCommandModal() {
		showCommandModal = false;
		ciCommandName = '';
		ciCommandRun = '';
		ciCommandTimeout = 900;
		ciCommandArtifacts = '';
		ciCommandCaches = '';
	}

	function openRunnerModal() {
		runnerCreatedInModal = false;
		showRunnerModal = true;
	}

	function updateTimeout(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		ciCommandTimeout = Number.isFinite(value) ? value : 900;
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
</script>

<SettingsSection title="CI" open>
	{#snippet actions()}
		<div class="flex items-center gap-2">
			<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] bg-[#1e1e1c] px-2.5 text-xs text-[#eae9e4] hover:bg-[#2a2a28]" onclick={() => (showCommandModal = true)}>
				<Plus class="h-3.5 w-3.5" /> Command
			</button>
			<SwitchControl checked={ci.enabled} disabled={busy || !ci.commands.length} label="Toggle CI" onToggle={toggleCi} />
		</div>
	{/snippet}
	<div class="grid gap-3">
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
						</div>
					</div>
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
						</div>
						<button class="flex h-7 w-7 items-center justify-center text-[#8c887e] hover:bg-[#252522] hover:text-[#eae9e4]" disabled={busy} onclick={() => loadCiArtifacts(job.id)} aria-label="Load CI artifacts">
							<Download class="h-3.5 w-3.5" />
						</button>
					</div>
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
						<span> · concurrency {runner.concurrency}</span>
						<span> · last seen {date(runner.last_seen_at)}</span>
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
				{#if runnerCreatedInModal && createdRunner?.token}
					<div class="border border-[#2a2a28] bg-[#0f0f0d] p-3">
						<div class="mb-2 text-xs text-[#8c887e]">Copy this runner token now. It will not be shown again.</div>
						<div class="flex items-center gap-2">
							<code class="min-w-0 flex-1 overflow-x-auto bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{createdRunner.token}</code>
							<button class="flex h-8 w-8 items-center justify-center border border-[#2a2a28] text-[#a09d94] hover:text-[#eae9e4]" onclick={() => copy(createdRunner.token ?? '')} aria-label="Copy runner token">
								{#if copied === createdRunner.token}<Check class="h-4 w-4" />{:else}<Copy class="h-4 w-4" />{/if}
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
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Name" bind:value={ciCommandName} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="bun test" bind:value={ciCommandRun} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Timeout seconds" inputmode="numeric" value={ciCommandTimeout} oninput={updateTimeout} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Artifacts: dist, coverage/lcov.info" bind:value={ciCommandArtifacts} />
				<input class="h-9 border border-[#2a2a28] bg-[#0f0f0d] px-3 font-mono text-xs text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c] focus-visible:outline-none" placeholder="Caches: bun-cache=.bun/install/cache" bind:value={ciCommandCaches} />
			</div>
			<div class="flex justify-end gap-2 border-t border-[#252522] px-4 py-3">
				<button class="border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" onclick={closeCommandModal}>Close</button>
				<button class="bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !ciCommandName.trim() || !ciCommandRun.trim()} onclick={createCommandFromModal}>Create command</button>
			</div>
		</div>
	</div>
{/if}
