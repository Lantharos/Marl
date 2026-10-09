export type ExampleJob = { key: string; name: string; runner: string; log: string[] };

export const workflowPath = '.marl/workflows/verify.yml';

export const workflow = [
  'name: Verify',
  '',
  'on:',
  '  push:',
  '    branches: [master]',
  '  pull_request:',
  '',
  'jobs:',
  '  check:',
  '    name: Check and test',
  '    labels: [docker]',
  '    runtime:',
  '      image: oven/bun:1',
  '    steps:',
  '      - name: Install',
  '        run: bun install --frozen-lockfile',
  '      - name: Test',
  '        run: bun run check && bun test',
  '  build:',
  '    name: Build',
  '    needs: [check]',
  '    labels: [docker]',
  '    runtime:',
  '      image: oven/bun:1',
  '    steps:',
  '      - name: Build',
  '        run: bun install --frozen-lockfile && bun run build'
];

export const preamble = [
  'marl · Verify #214',
  'repository: lantharos/marl',
  'commit: 4e1b9c7d20f3a86b5e1c94d7a02f6b3c8d915e24',
  '',
  'container: oven/bun:1',
  ''
];

export const jobs: ExampleJob[] = [
  {
    key: 'check',
    name: 'Check and test',
    runner: 'build-01',
    log: [
      '── Install ──',
      'bun install v1.4.2',
      'Checked 412 installs across 466 packages (no changes) [318.00ms]',
      '',
      '── Test ──',
      '$ svelte-check',
      'svelte-check found 0 errors and 0 warnings',
      'bun test v1.4.2',
      ' 128 pass',
      ' 0 fail',
      'Ran 128 tests across 24 files. [1.84s]'
    ]
  },
  {
    key: 'build',
    name: 'Build',
    runner: 'build-02',
    log: [
      '── Build ──',
      'bun install v1.4.2',
      'Checked 412 installs across 466 packages (no changes) [296.00ms]',
      '$ vite build',
      'vite v8.3.4 building for production...',
      '✓ 1284 modules transformed.',
      '✓ built in 6.12s'
    ]
  }
];

const jobsStart = workflow.indexOf('jobs:');

export const lineJobs = workflow.map((_, index) =>
  index > jobsStart
    ? workflow
        .slice(jobsStart, index + 1)
        .findLast((line) => /^ {2}\S/.test(line))
        ?.trim()
        .slice(0, -1)
    : undefined
);
