import { describe, expect, test } from 'bun:test';
import { parseWorkflow, supersedePushes } from './workflows';

describe('GitHub workflow compatibility', () => {
  test('expands matrices and makes dependent jobs wait for every expansion', () => {
    const result = parseWorkflow({
      jobs: {
        build: {
          'runs-on': 'ubuntu-latest',
          strategy: { matrix: { node: [20, 22] } },
          steps: [{ uses: 'actions/checkout@v4' }, { name: 'Test', run: 'echo ${{ matrix.node }}' }]
        },
        publish: { 'runs-on': ['self-hosted', 'release'], needs: 'build', steps: [{ run: 'echo done' }] }
      }
    }, '.github/workflows/verify.yml');
    expect(result.error).toBeUndefined();
    expect(result.jobs?.map((job) => job.key)).toEqual(['build_1', 'build_2', 'publish']);
    expect(result.jobs?.at(-1)?.needs).toEqual(['build_1', 'build_2']);
    expect(result.jobs?.[0].runtime.image).toBe('ubuntu:24.04');
    expect(result.jobs?.[0].labels).toContain('docker');
  });

  test('rejects unsupported actions instead of reporting a false success', () => {
    const result = parseWorkflow({ jobs: { check: { 'runs-on': 'ubuntu-latest', steps: [{ uses: 'vendor/unknown@v1' }] } } }, '.github/workflows/verify.yml');
    expect(result.error).toContain('not supported');
  });

  test('rejects oversized matrix products and includes before allocating jobs', () => {
    const product = parseWorkflow({ jobs: { check: { 'runs-on': 'ubuntu-latest', strategy: { matrix: { os: Array.from({ length: 9 }, (_, index) => index), runtime: [1, 2, 3, 4] } }, steps: [{ run: 'echo check' }] } } }, '.github/workflows/verify.yml');
    const includes = parseWorkflow({ jobs: { check: { 'runs-on': 'ubuntu-latest', strategy: { matrix: { runtime: Array.from({ length: 32 }, (_, index) => index), include: [{ runtime: 'extra' }] } }, steps: [{ run: 'echo check' }] } } }, '.github/workflows/verify.yml');
    expect(product.error).toBe('Workflow expansion produced more than 32 jobs.');
    expect(includes.error).toBe('Workflow expansion produced more than 32 jobs.');
  });
});

describe('workflow queue policy', () => {
  test('supersedes push runs by default with explicit opt-outs', () => {
    expect(supersedePushes({})).toBe(true);
    expect(supersedePushes({ supersede: false })).toBe(false);
    expect(supersedePushes({ concurrency: { 'cancel-in-progress': false } })).toBe(false);
    expect(supersedePushes({ concurrency: { 'cancel-in-progress': true } })).toBe(true);
  });
});
