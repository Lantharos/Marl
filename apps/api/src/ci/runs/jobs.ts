import { validTagName } from '../../core/domain';

export type RunStep = {
  name: string;
  run: string;
  shell?: string;
  environment?: Record<string, string>;
  workingDirectory?: string;
  timeoutMinutes?: number;
  continueOnError?: boolean;
};

export type RunService = { name: string; image: string; environment: Record<string, string> };

export type RunRelease = {
  tag: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  makeLatest: boolean;
  files: string[];
};

export type RunJob = {
  key: string;
  name: string;
  labels: string[];
  needs: string[];
  steps: RunStep[];
  environment: Record<string, string>;
  artifacts: string[];
  release?: RunRelease;
  runtime: { image: string; timeoutMinutes: number; services: RunService[] };
};

export type JobParseResult =
  { jobs: RunJob[]; error?: never } | { jobs?: never; error: { code: string; detail: string } };

export function environment(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (
    entries.length > 128 ||
    entries.some(
      ([key, item]) => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) || typeof item !== 'string' || item.length > 32_000
    )
  )
    return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function artifactPath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return (
    normalized.length > 0 &&
    normalized.length <= 260 &&
    !normalized.startsWith('/') &&
    !normalized.includes(':') &&
    normalized.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function image(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 240 && /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$/.test(normalized)
    ? normalized
    : null;
}

export function parseRunJobs(value: unknown): JobParseResult {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32)
    return { error: { code: 'invalid_jobs', detail: 'One to 32 jobs are required.' } };
  const jobs: RunJob[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object')
      return { error: { code: 'invalid_job', detail: 'Every job must be an object.' } };
    const job = raw as Record<string, unknown>;
    const labels = Array.isArray(job.labels)
      ? [...new Set(job.labels.map(String).map((label) => label.trim().toLowerCase()))]
      : [];
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const jobEnvironment = environment(job.environment);
    const runtimeValue = job.runtime && typeof job.runtime === 'object' ? (job.runtime as Record<string, unknown>) : {};
    const runtimeImage = image(runtimeValue.image ?? job.container ?? 'ubuntu:24.04');
    const timeoutMinutes = Number(runtimeValue.timeoutMinutes ?? job.timeoutMinutes ?? 360);
    const needs = Array.isArray(job.needs)
      ? [...new Set(job.needs.map(String))]
      : typeof job.needs === 'string'
        ? [job.needs]
        : [];
    const servicesValue = Array.isArray(runtimeValue.services) ? runtimeValue.services : [];
    const services: RunService[] = [];
    for (const value of servicesValue) {
      const service = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
      const serviceEnvironment = environment(service?.environment);
      const serviceImage = image(service?.image);
      if (
        !service ||
        typeof service.name !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,39}$/.test(service.name) ||
        !serviceImage ||
        !serviceEnvironment
      )
        return {
          error: { code: 'invalid_service', detail: 'Services need a valid name, container image, and environment.' }
        };
      services.push({ name: service.name, image: serviceImage, environment: serviceEnvironment });
    }
    if (
      typeof job.key !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(job.key) ||
      typeof job.name !== 'string' ||
      !job.name.trim() ||
      job.name.length > 160 ||
      labels.length > 32 ||
      labels.some((label) => !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(label)) ||
      needs.length > 31 ||
      needs.some((need) => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(need)) ||
      steps.length < 1 ||
      steps.length > 64 ||
      !jobEnvironment ||
      !runtimeImage ||
      !Number.isInteger(timeoutMinutes) ||
      timeoutMinutes < 1 ||
      timeoutMinutes > 1440 ||
      services.length > 8
    )
      return {
        error: {
          code: 'invalid_job',
          detail: 'Job keys, names, labels, dependencies, environment, runtime, and steps are invalid.'
        }
      };
    const parsedSteps: RunJob['steps'] = [];
    for (const rawStep of steps) {
      const step = rawStep as Record<string, unknown>;
      const stepEnvironment = environment(step?.environment);
      const stepTimeout = step.timeoutMinutes === undefined ? undefined : Number(step.timeoutMinutes);
      const workingDirectory = step.workingDirectory === undefined ? undefined : String(step.workingDirectory);
      if (
        !step ||
        typeof step.name !== 'string' ||
        !step.name.trim() ||
        step.name.length > 160 ||
        typeof step.run !== 'string' ||
        !step.run.trim() ||
        step.run.length > 50_000 ||
        (step.shell !== undefined &&
          (typeof step.shell !== 'string' || !['powershell', 'pwsh', 'cmd', 'sh', 'bash'].includes(step.shell))) ||
        !stepEnvironment ||
        (stepTimeout !== undefined && (!Number.isInteger(stepTimeout) || stepTimeout < 1 || stepTimeout > 1440)) ||
        (workingDirectory !== undefined && !artifactPath(workingDirectory))
      )
        return {
          error: {
            code: 'invalid_step',
            detail: 'Every step needs a valid name, command, shell, environment, working directory, and timeout.'
          }
        };
      parsedSteps.push({
        name: step.name,
        run: step.run,
        ...(typeof step.shell === 'string' ? { shell: step.shell } : {}),
        ...(Object.keys(stepEnvironment).length ? { environment: stepEnvironment } : {}),
        ...(workingDirectory ? { workingDirectory } : {}),
        ...(stepTimeout ? { timeoutMinutes: stepTimeout } : {}),
        ...(step.continueOnError === true ? { continueOnError: true } : {})
      });
    }
    const artifacts = Array.isArray(job.artifacts) ? job.artifacts.map(String) : [];
    if (artifacts.length > 32 || artifacts.some((path) => !artifactPath(path)))
      return { error: { code: 'invalid_artifacts', detail: 'Artifact paths must stay inside the job workspace.' } };
    const release = parseRelease(job.release);
    if (release === null)
      return {
        error: {
          code: 'invalid_release',
          detail: 'Job releases need a valid tag, optional notes, and workspace-relative files.'
        }
      };
    const artifactPaths = [...new Set([...artifacts, ...(release?.files ?? [])])];
    if (artifactPaths.length > 32)
      return { error: { code: 'invalid_artifacts', detail: 'A job can upload at most 32 artifact paths.' } };
    jobs.push({
      key: job.key,
      name: job.name,
      labels,
      needs,
      steps: parsedSteps,
      environment: jobEnvironment,
      artifacts: artifactPaths,
      ...(release ? { release } : {}),
      runtime: { image: runtimeImage, timeoutMinutes, services }
    });
  }
  if (new Set(jobs.map((job) => job.key)).size !== jobs.length)
    return { error: { code: 'duplicate_job', detail: 'Job keys must be unique.' } };
  if (
    jobs.some(
      (job) =>
        job.needs.includes(job.key) || job.needs.some((need) => !jobs.some((candidate) => candidate.key === need))
    )
  )
    return {
      error: { code: 'invalid_dependency', detail: 'Every job dependency must refer to another job in this run.' }
    };
  const resolved = new Set<string>();
  while (resolved.size < jobs.length) {
    const ready = jobs.filter((job) => !resolved.has(job.key) && job.needs.every((need) => resolved.has(need)));
    if (!ready.length)
      return { error: { code: 'dependency_cycle', detail: 'Job dependencies cannot contain a cycle.' } };
    for (const job of ready) resolved.add(job.key);
  }
  return { jobs };
}

function parseRelease(value: unknown): RunRelease | undefined | null {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const release = value as Record<string, unknown>;
  const files =
    release.files === undefined
      ? []
      : Array.isArray(release.files)
        ? release.files.map(String)
        : [String(release.files)];
  const tag = typeof release.tag === 'string' ? release.tag.trim() : '';
  const name = typeof release.name === 'string' ? release.name.trim() : '';
  const body = typeof release.body === 'string' ? release.body : '';
  if (
    !validTagName(tag) ||
    name.length > 240 ||
    body.length > 100_000 ||
    files.length > 32 ||
    files.some((path) => !artifactPath(path))
  )
    return null;
  const draft = release.draft === true;
  const prerelease = release.prerelease === true;
  return {
    tag,
    name,
    body,
    draft,
    prerelease,
    makeLatest: !draft && !prerelease && release.makeLatest !== false,
    files
  };
}
