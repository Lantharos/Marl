export type ObjectValue = Record<string, unknown>;

export function workflowJobs(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).map(([key, raw]) =>
    raw && typeof raw === 'object' ? { key, name: key, ...(raw as ObjectValue) } : raw
  );
}

export function stringEnvironment(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

function matrixRows(value: unknown, limit: number): Array<Record<string, string>> {
  if (limit < 1) throw new Error('Workflow expansion produced more than 32 jobs.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{}];
  const axes = Object.entries(value as ObjectValue).filter(([key]) => !['include', 'exclude'].includes(key));
  if (axes.length > 16) throw new Error('A job matrix may define at most 16 axes.');
  let rows: Array<Record<string, string>> = [{}];
  for (const [key, raw] of axes) {
    if (!Array.isArray(raw) || !raw.length) return [];
    if (raw.length > 32 || raw.length > Math.floor(limit / rows.length))
      throw new Error('Workflow expansion produced more than 32 jobs.');
    rows = rows.flatMap((row) => raw.map((item) => ({ ...row, [key]: String(item) })));
  }
  const excludedValue = (value as ObjectValue).exclude;
  if (
    excludedValue !== undefined &&
    (!Array.isArray(excludedValue) ||
      excludedValue.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry)))
  )
    throw new Error('Matrix exclusions must be objects.');
  const excluded = (excludedValue ?? []) as ObjectValue[];
  rows = rows.filter(
    (row) => !excluded.some((entry) => Object.entries(entry).every(([key, item]) => row[key] === String(item)))
  );
  const includedValue = (value as ObjectValue).include;
  if (
    includedValue !== undefined &&
    (!Array.isArray(includedValue) ||
      includedValue.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry)))
  )
    throw new Error('Matrix inclusions must be objects.');
  const included = (includedValue ?? []) as ObjectValue[];
  if (included.length > limit - rows.length) throw new Error('Workflow expansion produced more than 32 jobs.');
  return [
    ...rows,
    ...included.map((entry) => Object.fromEntries(Object.entries(entry).map(([key, item]) => [key, String(item)])))
  ];
}

function interpolate(value: string, matrix: Record<string, string>): string {
  return value.replace(/\$\{\{\s*matrix\.([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => matrix[key] ?? '');
}

function githubRuntime(job: ObjectValue, matrix: Record<string, string>) {
  const runsOn = (
    typeof job['runs-on'] === 'string'
      ? [job['runs-on']]
      : Array.isArray(job['runs-on'])
        ? job['runs-on'].map(String)
        : []
  ).map((label) => interpolate(label, matrix));
  if (!runsOn.length) throw new Error('Every GitHub Actions job needs runs-on.');
  if (runsOn.some((label) => /^(windows|macos)-/.test(label)))
    throw new Error('Windows and macOS hosted images are not available on Docker runners.');
  const labels = runsOn.some((label) => /^ubuntu-/.test(label))
    ? ['docker']
    : runsOn.filter((label) => label !== 'self-hosted');
  if (!labels.includes('docker')) labels.push('docker');
  const container = job.container;
  const image = interpolate(
    typeof container === 'string'
      ? container
      : container && typeof container === 'object'
        ? String((container as ObjectValue).image ?? '')
        : 'ubuntu:24.04',
    matrix
  );
  const services = Object.entries(
    job.services && typeof job.services === 'object' ? (job.services as ObjectValue) : {}
  ).map(([name, raw]) => {
    const service = typeof raw === 'string' ? { image: raw } : (raw as ObjectValue);
    return {
      name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      image: interpolate(String(service.image ?? ''), matrix),
      environment: stringEnvironment(service.env)
    };
  });
  return { labels, runtime: { image, timeoutMinutes: Number(job['timeout-minutes'] ?? 360), services } };
}

function githubSteps(job: ObjectValue, matrix: Record<string, string>) {
  const steps: Array<Record<string, unknown>> = [];
  const artifacts: string[] = [];
  let release: Record<string, unknown> | undefined;
  for (const [index, raw] of (Array.isArray(job.steps) ? job.steps : []).entries()) {
    if (!raw || typeof raw !== 'object') throw new Error('Every GitHub Actions step must be an object.');
    const step = raw as ObjectValue;
    if (typeof step.uses === 'string') {
      const action = step.uses.toLowerCase();
      if (action.startsWith('actions/checkout@')) continue;
      if (action.startsWith('actions/upload-artifact@')) {
        const path = step.with && typeof step.with === 'object' ? String((step.with as ObjectValue).path ?? '') : '';
        artifacts.push(
          ...path
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
        );
        continue;
      }
      if (action === 'marl/release@v1') {
        if (release) throw new Error('A job can publish only one release.');
        const input = step.with && typeof step.with === 'object' ? (step.with as ObjectValue) : {};
        const files = String(input.files ?? input.path ?? '')
          .split(/\r?\n/)
          .map((item) => interpolate(item.trim(), matrix))
          .filter(Boolean);
        release = {
          tag: interpolate(String(input.tag ?? ''), matrix)
            .replaceAll('${{ github.sha }}', '$MARL_COMMIT')
            .replaceAll('${{ github.ref_name }}', '$MARL_BRANCH'),
          name: interpolate(String(input.name ?? ''), matrix),
          body: String(input.body ?? ''),
          draft: String(input.draft ?? 'false') === 'true',
          prerelease: String(input.prerelease ?? 'false') === 'true',
          makeLatest: String(input.latest ?? 'true') !== 'false',
          files
        };
        artifacts.push(...files);
        continue;
      }
      throw new Error(`Action ${step.uses} is not supported yet. Use a run step or a supported Marl action.`);
    }
    if (typeof step.run !== 'string') throw new Error('Every GitHub Actions step needs run or uses.');
    const run = interpolate(step.run, matrix)
      .replaceAll('${{ github.sha }}', '$MARL_COMMIT')
      .replaceAll('${{ github.ref_name }}', '$MARL_BRANCH');
    if (run.includes('${{'))
      throw new Error(`Step ${step.name ?? index + 1} uses an expression Marl cannot evaluate yet.`);
    const shell = typeof step.shell === 'string' ? step.shell.split(/[ {]/)[0] : 'bash';
    steps.push({
      name: String(step.name ?? `Step ${index + 1}`),
      run,
      shell,
      environment: stringEnvironment(step.env),
      ...(typeof step['working-directory'] === 'string'
        ? { workingDirectory: interpolate(step['working-directory'], matrix) }
        : {}),
      ...(step['timeout-minutes'] !== undefined ? { timeoutMinutes: Number(step['timeout-minutes']) } : {}),
      ...(step['continue-on-error'] === true ? { continueOnError: true } : {})
    });
  }
  if (!steps.length)
    steps.push({ name: 'Finalize', run: 'printf "Workflow has no executable steps.\\n"', shell: 'sh' });
  return { steps, artifacts, release };
}

export function githubJobs(value: unknown, globalEnvironment: Record<string, string>): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const jobs: Array<Record<string, unknown>> = [];
  for (const [baseKey, raw] of Object.entries(value as ObjectValue)) {
    if (!raw || typeof raw !== 'object') throw new Error(`Job ${baseKey} is invalid.`);
    const job = raw as ObjectValue;
    const rows = matrixRows(
      job.strategy && typeof job.strategy === 'object' ? (job.strategy as ObjectValue).matrix : undefined,
      32 - jobs.length
    );
    if (!rows.length) throw new Error(`Job ${baseKey} has an empty matrix.`);
    for (const [index, matrix] of rows.entries()) {
      const suffix = rows.length === 1 ? '' : `_${index + 1}`;
      const key = `${baseKey}${suffix}`
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .slice(0, 64);
      const runtime = githubRuntime(job, matrix);
      const translated = githubSteps(job, matrix);
      const matrixLabel = Object.values(matrix).join(', ');
      const rawNeeds =
        typeof job.needs === 'string' ? [job.needs] : Array.isArray(job.needs) ? job.needs.map(String) : [];
      const containerEnvironment =
        job.container && typeof job.container === 'object' ? stringEnvironment((job.container as ObjectValue).env) : {};
      jobs.push({
        key,
        name: interpolate(String(job.name ?? baseKey), matrix) + (matrixLabel ? ` (${matrixLabel})` : ''),
        labels: runtime.labels,
        needs: rawNeeds.map((need) => need.toLowerCase().replace(/[^a-z0-9_-]/g, '-')),
        steps: translated.steps,
        environment: {
          ...globalEnvironment,
          ...stringEnvironment(job.env),
          ...containerEnvironment,
          ...Object.fromEntries(
            Object.entries(matrix).map(([name, item]) => [
              `MATRIX_${name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
              item
            ])
          )
        },
        artifacts: translated.artifacts,
        ...(translated.release ? { release: translated.release } : {}),
        runtime: runtime.runtime
      });
    }
  }
  if (jobs.length > 32) throw new Error('Matrix expansion produced more than 32 jobs.');
  const keys = jobs.map((job) => String(job.key));
  for (const job of jobs) {
    job.needs = (job.needs as string[]).flatMap((need) =>
      keys.filter((key) => key === need || key.startsWith(`${need}_`))
    );
  }
  return jobs;
}
