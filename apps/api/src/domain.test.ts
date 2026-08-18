import { describe, expect, test } from 'bun:test';
import { safeRepositoryPath, validBranchName, validSlug, validVisibility } from './domain';

describe('repository input validation', () => {
  test('accepts familiar repository slugs', () => {
    expect(validSlug('marl')).toBe(true);
    expect(validSlug('marl.sh')).toBe(true);
    expect(validSlug('runner-service_v2')).toBe(true);
  });

  test('rejects reserved, ambiguous, and malformed slugs', () => {
    for (const value of ['api', 'pulls', '-marl', 'marl-', 'a/b', '', '../marl']) expect(validSlug(value)).toBe(false);
  });

  test('accepts only supported visibility values', () => {
    expect(validVisibility('private')).toBe(true);
    expect(validVisibility('public')).toBe(true);
    expect(validVisibility('internal')).toBe(false);
  });
});

describe('Git branch validation', () => {
  test('accepts normal nested branch names', () => {
    expect(validBranchName('feature/review-ui')).toBe(true);
    expect(validBranchName('release/2026.08')).toBe(true);
  });
  test('rejects unsafe ref names', () => {
    for (const value of ['../main', 'feature//bad', 'bad.lock', 'bad branch', 'topic~1']) expect(validBranchName(value)).toBe(false);
  });
});

describe('repository path validation', () => {
  test('allows normalized paths inside a repository', () => {
    expect(safeRepositoryPath('apps/web/src/app.css')).toBe(true);
    expect(safeRepositoryPath('README.md')).toBe(true);
  });

  test('rejects traversal, absolute paths, and empty segments', () => {
    for (const path of ['../secret', 'apps/../secret', '/etc/passwd', 'C:\\secret', 'apps//web']) expect(safeRepositoryPath(path)).toBe(false);
  });
});
