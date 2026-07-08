<script lang="ts">
	import { page } from '$app/stores';
	import {
		cancelCiJob,
		createProjectApiKey,
		createProjectWebhook,
		createCiRunner,
		deleteCiSecret,
		deleteCiRunner,
		deleteProjectApiKey,
		deleteProjectIntegration,
		deleteProjectWebhook,
		downloadCiJobArtifact,
		getCiJobLogs,
		getProjectSettings,
		isAbortError,
		listCiJobArtifacts,
		listCiJobs,
		listCiRunners,
		listCiSecrets,
		listProjectApiKeys,
		listProjectIntegrations,
		listProjectWebhookDeliveries,
		listProjectWebhooks,
		rerunCiJob,
		testProjectWebhook,
		triggerProjectWebhook,
		updateProjectSettings,
		upsertCiSecret,
		type CiArtifact,
		type CiJob,
		type CiLogLine,
		type CiRunner,
		type CiSecret,
		type ProjectApiKey,
		type ProjectIntegration,
		type ProjectSettings,
		type ProjectWebhook,
		type ProjectWebhookDelivery
	} from '$lib/api';
	import SettingsAutomation from '$lib/components/SettingsAutomation.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import { onDestroy } from 'svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let apiKeys = $state<ProjectApiKey[]>([]);
	let webhooks = $state<ProjectWebhook[]>([]);
	let integrations = $state<ProjectIntegration[]>([]);
	let runners = $state<CiRunner[]>([]);
	let ciJobs = $state<CiJob[]>([]);
	let ciArtifactsByJob = $state<Record<string, CiArtifact[]>>({});
	let ciLogsByJob = $state<Record<string, CiLogLine[]>>({});
	let liveCiLogJobs = $state<string[]>([]);
	let ciSecrets = $state<CiSecret[]>([]);
	let webhookDeliveriesByHook = $state<Record<string, ProjectWebhookDelivery[]>>({});
	let settings = $state<ProjectSettings | null>(null);
	let keyName = $state('');
	let keyScopes = $state<string[]>([
		'workspaces:read',
		'workspaces:create',
		'workspaces:write',
		'workspaces:ready'
	]);
	let generatedKey = $state<ProjectApiKey | null>(null);
	let webhookName = $state('');
	let webhookUrl = $state('');
	let webhookEvents = $state<string[]>(['manual', 'snapshot.shipped', 'release.created']);
	let createdWebhook = $state<ProjectWebhook | null>(null);
	let runnerName = $state('');
	let runnerConcurrency = $state(1);
	let runnerLabels = $state('');
	let createdRunner = $state<CiRunner | null>(null);
	let ciCommandName = $state('');
	let ciCommandRun = $state('');
	let ciCommandTimeout = $state(900);
	let ciCommandArtifacts = $state('');
	let ciCommandCaches = $state('');
	let ciCommandEvents = $state('workspace.ready');
	let ciCommandWorkspaces = $state('');
	let ciCommandComponents = $state('');
	let ciCommandMatrix = $state('');
	let ciCommandBlocks = $state('');
	let ciCommandPaths = $state('');
	let ciCommandLabels = $state('');
	let ciCommandEnv = $state('');
	let ciCommandSecrets = $state('');
	let ciSecretKey = $state('');
	let ciSecretValue = $state('');
	let testMessage = $state('');
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			await Promise.all([
				loadAutomation(signal),
				loadProjectCiSettings(signal),
				loadCiRunners(signal),
				loadCiSecrets(signal),
				refreshCiJobs(signal, true)
			]);
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function loadAutomation(signal?: AbortSignal) {
		const [keys, hooks, apps] = await Promise.all([
			listProjectApiKeys(tenant, project, { all: true, signal }),
			listProjectWebhooks(tenant, project, { all: true, signal }),
			listProjectIntegrations(tenant, project, { all: true, signal })
		]);
		apiKeys = keys.items;
		webhooks = hooks.items;
		integrations = apps.items;
	}

	async function loadProjectCiSettings(signal?: AbortSignal) {
		const loadedSettings = await getProjectSettings(tenant, project, { signal });
		settings = loadedSettings;
	}

	async function loadCiRunners(signal?: AbortSignal) {
		const loadedRunners = await listCiRunners(tenant, project, { all: true, signal });
		runners = loadedRunners.items;
	}

	async function loadCiSecrets(signal?: AbortSignal) {
		const loadedSecrets = await listCiSecrets(tenant, project, { signal });
		ciSecrets = loadedSecrets;
	}

	async function refreshCiJobs(signal?: AbortSignal, quiet = false) {
		if (!quiet) error = '';
		try {
			const loadedJobs = await listCiJobs(tenant, project, { perPage: 20, signal });
			if (!signal?.aborted) ciJobs = loadedJobs.items;
		} catch (e) {
			if (isAbortError(e)) return;
			if (!quiet) error = e instanceof Error ? e.message : 'Failed';
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	$effect(() => {
		const active = liveCiLogJobs.filter((jobId) => ciJobs.some((job) => job.id === jobId && job.status !== 'completed'));
		if (!active.length) return;
		const timer = window.setInterval(() => {
			for (const jobId of active) void loadCiLogs(jobId, true);
		}, 2500);
		return () => window.clearInterval(timer);
	});

	$effect(() => {
		if (!ciJobs.some((job) => job.status !== 'completed')) return;
		const controller = new AbortController();
		const timer = window.setInterval(() => {
			void refreshCiJobs(controller.signal, true);
		}, 5000);
		return () => {
			controller.abort();
			window.clearInterval(timer);
		};
	});

	async function addApiKey() {
		if (!keyName.trim()) return;
		busy = true;
		error = '';
		generatedKey = null;
		try {
			generatedKey = await createProjectApiKey(tenant, project, {
				name: keyName.trim(),
				scopes: keyScopes
			});
			keyName = '';
			await loadAutomation();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeApiKey(id: string) {
		busy = true;
		error = '';
		try {
			await deleteProjectApiKey(tenant, project, id);
			await loadAutomation();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function addWebhook() {
		if (!webhookName.trim() || !webhookUrl.trim()) return;
		busy = true;
		error = '';
		testMessage = '';
		createdWebhook = null;
		try {
			createdWebhook = await createProjectWebhook(tenant, project, {
				name: webhookName.trim(),
				url: webhookUrl.trim(),
				events: webhookEvents
			});
			webhookName = '';
			webhookUrl = '';
			await loadAutomation();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeWebhook(id: string) {
		busy = true;
		error = '';
		try {
			await deleteProjectWebhook(tenant, project, id);
			await loadAutomation();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function testWebhook(id: string) {
		busy = true;
		error = '';
		testMessage = '';
		try {
			const result = await testProjectWebhook(tenant, project, id);
			testMessage = result.queued ? 'Webhook test queued.' : result.ok ? `Webhook returned ${result.status}` : `Webhook failed with ${result.status || 'no response'}`;
			await loadAutomation();
			await loadWebhookDeliveries(id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function triggerWebhook(id: string) {
		busy = true;
		error = '';
		testMessage = '';
		try {
			const result = await triggerProjectWebhook(tenant, project, id);
			testMessage = result.queued ? 'Manual event queued.' : result.ok ? `Manual event returned ${result.status}` : `Manual event failed with ${result.status || 'no response'}`;
			await loadAutomation();
			await loadWebhookDeliveries(id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeIntegration(id: string) {
		busy = true;
		error = '';
		try {
			await deleteProjectIntegration(tenant, project, id);
			await loadAutomation();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function saveCiSettings(ci: ProjectSettings['ci']) {
		if (!settings) return;
		busy = true;
		error = '';
		try {
			settings = await updateProjectSettings(tenant, project, { ci });
			await refreshCiJobs(undefined, true);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function toggleCi() {
		if (!settings) return;
		await saveCiSettings({ ...settings.ci, enabled: !settings.ci.enabled });
	}

	async function addCiCommand() {
		if (!settings || !ciCommandName.trim() || !ciCommandRun.trim()) return;
		const artifacts = splitList(ciCommandArtifacts);
		const cache = parseCacheEntries(ciCommandCaches);
		const events = splitList(ciCommandEvents);
		const workspaces = splitList(ciCommandWorkspaces);
		const components = splitList(ciCommandComponents);
		const matrix = parseMatrixEntries(ciCommandMatrix);
		const uses_blocks = splitList(ciCommandBlocks);
		const paths = splitList(ciCommandPaths);
		const labels = splitList(ciCommandLabels);
		const env = parseEnvEntries(ciCommandEnv);
		const secrets = splitList(ciCommandSecrets);
		const name = ciCommandName.trim();
		await saveCiSettings({
			...settings.ci,
			commands: [
				...settings.ci.commands.filter((command) => command.name !== name),
				{
					name,
					run: ciCommandRun.trim(),
					timeout_seconds: Math.max(1, Math.min(14400, ciCommandTimeout || 900)),
					...(events.length ? { events } : {}),
					...(workspaces.length ? { workspaces } : {}),
					...(components.length ? { components } : {}),
					...(matrix.length ? { matrix } : {}),
					...(uses_blocks.length ? { uses_blocks } : {}),
					...(paths.length ? { paths } : {}),
					...(labels.length ? { labels } : {}),
					...(env.length ? { env } : {}),
					...(secrets.length ? { secrets } : {}),
					...(artifacts.length ? { artifacts } : {}),
					...(cache.length ? { cache } : {})
				}
			]
		});
		ciCommandName = '';
		ciCommandRun = '';
		ciCommandTimeout = 900;
		ciCommandArtifacts = '';
		ciCommandCaches = '';
		ciCommandEvents = 'workspace.ready';
		ciCommandWorkspaces = '';
		ciCommandComponents = '';
		ciCommandMatrix = '';
		ciCommandBlocks = '';
		ciCommandPaths = '';
		ciCommandLabels = '';
		ciCommandEnv = '';
		ciCommandSecrets = '';
	}

	async function removeCiCommand(name: string) {
		if (!settings) return;
		await saveCiSettings({
			...settings.ci,
			commands: settings.ci.commands.filter((command) => command.name !== name)
		});
	}

	async function addRunner() {
		if (!runnerName.trim()) return;
		busy = true;
		error = '';
		createdRunner = null;
		try {
			createdRunner = await createCiRunner(tenant, project, runnerName.trim(), Math.max(1, Math.min(32, runnerConcurrency || 1)), splitList(runnerLabels));
			runnerName = '';
			runnerConcurrency = 1;
			runnerLabels = '';
			await loadCiRunners();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeRunner(id: string) {
		busy = true;
		error = '';
		try {
			await deleteCiRunner(tenant, project, id);
			await loadCiRunners();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function loadCiArtifacts(jobId: string) {
		error = '';
		try {
			const artifacts = await listCiJobArtifacts(tenant, project, jobId);
			ciArtifactsByJob = { ...ciArtifactsByJob, [jobId]: artifacts };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function loadCiLogs(jobId: string, quiet = false) {
		if (!quiet) error = '';
		try {
			const logs = await getCiJobLogs(tenant, project, jobId);
			ciLogsByJob = { ...ciLogsByJob, [jobId]: logs };
			if (!liveCiLogJobs.includes(jobId)) {
				liveCiLogJobs = [...liveCiLogJobs, jobId];
			}
		} catch (e) {
			if (!quiet) error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function downloadCiArtifact(jobId: string, artifact: CiArtifact) {
		error = '';
		try {
			const result = await downloadCiJobArtifact(tenant, project, jobId, artifact.id);
			const url = URL.createObjectURL(result.blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = result.filename ?? artifact.name;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 0);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function cancelJob(jobId: string) {
		busy = true;
		error = '';
		try {
			await cancelCiJob(tenant, project, jobId);
			await refreshCiJobs();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function rerunJob(jobId: string) {
		busy = true;
		error = '';
		try {
			await rerunCiJob(tenant, project, jobId);
			await refreshCiJobs();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function saveCiSecret() {
		if (!ciSecretKey.trim() || !ciSecretValue) return;
		busy = true;
		error = '';
		try {
			await upsertCiSecret(tenant, project, ciSecretKey.trim(), ciSecretValue);
			ciSecretKey = '';
			ciSecretValue = '';
			await loadCiSecrets();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeCiSecret(key: string) {
		busy = true;
		error = '';
		try {
			await deleteCiSecret(tenant, project, key);
			await loadCiSecrets();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function loadWebhookDeliveries(id: string) {
		error = '';
		try {
			const deliveries = await listProjectWebhookDeliveries(tenant, project, id, { perPage: 12 });
			webhookDeliveriesByHook = { ...webhookDeliveriesByHook, [id]: deliveries.items };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	function splitList(value: string) {
		return value
			.split(/[,\n]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function parseCacheEntries(value: string) {
		return splitList(value)
			.map((item) => {
				const index = item.indexOf('=');
				if (index <= 0) return null;
				const key = item.slice(0, index).trim();
				const path = item.slice(index + 1).trim();
				return key && path ? { key, path } : null;
			})
			.filter((entry): entry is { key: string; path: string } => Boolean(entry));
	}

	function parseMatrixEntries(value: string) {
		return splitList(value)
			.map((item) => {
				const index = item.indexOf('=');
				if (index <= 0) return null;
				const key = item.slice(0, index).trim();
				const values = item.slice(index + 1).split('|').map((value) => value.trim()).filter(Boolean);
				return key && values.length ? { key, values } : null;
			})
			.filter((entry): entry is { key: string; values: string[] } => Boolean(entry));
	}

	function parseEnvEntries(value: string) {
		return splitList(value)
			.map((item) => {
				const index = item.indexOf('=');
				if (index <= 0) return null;
				const key = item.slice(0, index).trim();
				const envValue = item.slice(index + 1).trim();
				return key && envValue ? { key, value: envValue } : null;
			})
			.filter((entry): entry is { key: string; value: string } => Boolean(entry));
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 grid gap-1">
		<h2 class="text-base font-semibold text-[#f0eee4]">Automation</h2>
		<p class="text-sm text-[#6f6b5f]">API keys, webhooks, and connected apps for this project.</p>
	</div>

	{#if loading}
		<div class="flex min-h-[220px] items-center justify-center">
			<Spinner />
		</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if !canMaintain}
		<div class="border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">Project automation is limited to maintainers.</p>
		</div>
	{:else}
		<SettingsAutomation
			{apiKeys}
			{webhooks}
			{integrations}
			{runners}
			{ciJobs}
			{ciArtifactsByJob}
			{ciLogsByJob}
			{ciSecrets}
			{webhookDeliveriesByHook}
			ci={settings?.ci ?? { enabled: false, commands: [] }}
			{tenant}
			{project}
			components={settings?.components ?? []}
			{busy}
			{generatedKey}
			{createdWebhook}
			{createdRunner}
			bind:keyName
			bind:keyScopes
			bind:webhookName
			bind:webhookUrl
			bind:webhookEvents
			bind:runnerName
			bind:runnerConcurrency
			bind:runnerLabels
			bind:ciCommandName
			bind:ciCommandRun
			bind:ciCommandTimeout
			bind:ciCommandArtifacts
			bind:ciCommandCaches
			bind:ciCommandEvents
			bind:ciCommandWorkspaces
			bind:ciCommandComponents
			bind:ciCommandMatrix
			bind:ciCommandBlocks
			bind:ciCommandPaths
			bind:ciCommandLabels
			bind:ciCommandEnv
			bind:ciCommandSecrets
			bind:ciSecretKey
			bind:ciSecretValue
			{testMessage}
			{addApiKey}
			{removeApiKey}
			{addWebhook}
			{removeWebhook}
			{testWebhook}
			{triggerWebhook}
			{removeIntegration}
			{loadCiArtifacts}
			{loadCiLogs}
			{downloadCiArtifact}
			{cancelJob}
			{rerunJob}
			{saveCiSecret}
			{removeCiSecret}
			{loadWebhookDeliveries}
			{toggleCi}
			{saveCiSettings}
			{addCiCommand}
			{removeCiCommand}
			{addRunner}
			{removeRunner}
		/>
	{/if}
</div>
