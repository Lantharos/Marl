import { parseAllDocuments } from 'yaml';
import type { CiCommand, CiCommandBlock, ProjectCiSettings } from '$lib/api';

type WorkflowDoc = Record<string, unknown>;

export type WorkflowImportResult = Pick<ProjectCiSettings, 'commands' | 'blocks'>;

export function importGitHubWorkflows(source: string): WorkflowImportResult {
	const documents = parseAllDocuments(source)
		.map((document) => document.toJSON())
		.filter((value): value is WorkflowDoc => Boolean(value) && typeof value === 'object' && !Array.isArray(value));
	const commands: CiCommand[] = [];
	const blocks: CiCommandBlock[] = [];
	for (const workflow of documents) {
		const workflowName = text(workflow.name) || 'workflow';
		const workflowEnv = envEntries(workflow.env);
		const events = workflowEvents(workflow.on ?? workflow.true);
		const paths = workflowPaths(workflow.on ?? workflow.true);
		const jobs = object(workflow.jobs);
		for (const [jobId, rawJob] of Object.entries(jobs)) {
			const job = object(rawJob);
			if (!Object.keys(job).length) continue;
			const jobName = text(job.name) || titleFromId(jobId);
			const labels = labelsFromRunsOn(job['runs-on']);
			const matrix = matrixEntries(object(object(job.strategy).matrix));
			const jobEnv = [...workflowEnv, ...envEntries(job.env)];
			const steps = Array.isArray(job.steps) ? job.steps : [];
			const stepScript = workflowStepScript(steps);
			const run = stepScript.run.join('\n').trim();
			if (!run) continue;
			const command: CiCommand = {
				name: `${workflowName} / ${jobName}`.slice(0, 80),
				run,
				timeout_seconds: timeoutSeconds(job['timeout-minutes']),
				events,
				paths,
				matrix,
				labels,
				env: jobEnv,
				secrets: uniqueStrings([...secretsFromValue(job), ...stepScript.secrets]),
				artifacts: stepScript.artifacts,
				cache: stepScript.cache
			};
			const setupBlock = reusableSetupBlock(`${workflowName} / setup`, steps, workflowEnv, jobEnv);
			if (setupBlock && !blocks.some((block) => block.name === setupBlock.name)) {
				blocks.push(setupBlock);
			}
			if (setupBlock) {
				command.uses_blocks = [setupBlock.name];
				command.run = command.run
					.split('\n')
					.filter((line) => !setupLine(line))
					.join('\n')
					.trim() || run;
			}
			commands.push(command);
		}
	}
	return { commands, blocks };
}

function workflowEvents(value: unknown) {
	if (typeof value === 'string') return [mapEvent(value)];
	if (Array.isArray(value)) return uniqueStrings(value.map(text).filter(Boolean).map(mapEvent));
	const events = object(value);
	const mapped = Object.keys(events).map(mapEvent);
	return mapped.length ? uniqueStrings(mapped) : ['workspace.ready'];
}

function mapEvent(value: string) {
	if (value === 'push') return 'workspace.push';
	if (value === 'release') return 'release.created';
	if (value === 'workflow_dispatch') return 'manual';
	return 'workspace.ready';
}

function workflowPaths(value: unknown) {
	const on = object(value);
	const paths = [
		...stringList(object(on.push).paths),
		...stringList(object(on.pull_request).paths),
		...stringList(object(on.pull_request_target).paths)
	];
	return uniqueStrings(paths);
}

function workflowStepScript(steps: unknown[]) {
	const run: string[] = [];
	const artifacts: string[] = [];
	const cache: { key: string; path: string }[] = [];
	const secrets: string[] = [];
	for (const rawStep of steps) {
		const step = object(rawStep);
		const uses = text(step.uses).toLowerCase();
		const withValue = object(step.with);
		const stepRun = text(step.run);
		if (stepRun) run.push(stepRun);
		if (uses.includes('actions/upload-artifact')) {
			const path = text(withValue.path);
			if (path) artifacts.push(path);
		}
		if (uses.includes('actions/cache')) {
			const path = text(withValue.path);
			const key = text(withValue.key) || `cache-${cache.length + 1}`;
			if (path) cache.push({ key, path });
		}
		if (uses.includes('cloudflare/wrangler-action')) {
			run.push(text(withValue.command) || 'bunx wrangler deploy');
		}
		secrets.push(...secretsFromValue(step));
	}
	return {
		run,
		artifacts: uniqueStrings(artifacts),
		cache,
		secrets: uniqueStrings(secrets)
	};
}

function reusableSetupBlock(name: string, steps: unknown[], workflowEnv: { key: string; value: string }[], jobEnv: { key: string; value: string }[]) {
	const run = steps.map(object).map((step) => text(step.run)).filter(setupLine);
	if (!run.length) return null;
	return {
		name,
		run: uniqueStrings(run).join('\n'),
		env: uniqueEnv([...workflowEnv, ...jobEnv]),
		secrets: [],
		cache: []
	};
}

function setupLine(value: string) {
	const lower = value.toLowerCase();
	return lower.includes('bun install') || lower.includes('npm ci') || lower.includes('pnpm install') || lower.includes('yarn install') || lower.includes('cargo fetch');
}

function labelsFromRunsOn(value: unknown) {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return uniqueStrings(value.map(text).filter(Boolean));
	return [];
}

function matrixEntries(matrix: Record<string, unknown>) {
	return Object.entries(matrix)
		.filter(([key]) => key !== 'include' && key !== 'exclude')
		.map(([key, value]) => ({ key, values: stringList(value) }))
		.filter((entry) => entry.values.length);
}

function envEntries(value: unknown) {
	return Object.entries(object(value))
		.map(([key, raw]) => ({ key, value: text(raw) }))
		.filter((entry) => entry.key && entry.value);
}

function secretsFromValue(value: unknown) {
	const source = JSON.stringify(value);
	return uniqueStrings([...source.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]));
}

function timeoutSeconds(value: unknown) {
	const minutes = Number(value);
	return Number.isFinite(minutes) && minutes > 0 ? Math.min(14_400, Math.floor(minutes * 60)) : 900;
}

function object(value: unknown): Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return '';
}

function stringList(value: unknown) {
	if (Array.isArray(value)) return uniqueStrings(value.map(text).filter(Boolean));
	const single = text(value);
	return single ? [single] : [];
}

function uniqueStrings(values: string[]) {
	const seen = new Set<string>();
	return values.filter((value) => {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) return false;
		seen.add(trimmed);
		return true;
	});
}

function uniqueEnv(entries: { key: string; value: string }[]) {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		if (seen.has(entry.key)) return false;
		seen.add(entry.key);
		return true;
	});
}

function titleFromId(value: string) {
	return value
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
