import { describe, expect, test } from 'bun:test';
import type { BranchRule } from './branch-rules';
import { mergeRequirements } from './pull-requirements';

const pull = { authorId: 'author', sourceCommitId: 'head-2', state: 'open' as const };
const checks = { total: 1, passed: 1, failed: 0, running: 0, items: [{ name: 'Project checks / Check repository', state: 'success' }] };
const rule: BranchRule = { pattern: 'main', requiredApprovals: 1, requiredChecks: ['Project checks / Check repository'], requireConversations: true, dismissStaleReviews: true, allowedMergeMethods: ['merge'] };

describe('pull merge requirements', () => {
  test('requires a non-author approval, successful checks, and resolved conversations', () => {
    const result = mergeRequirements(pull, rule, checks, [
      { authorId: 'author', state: 'approved', commitId: 'head-2' },
      { authorId: 'reviewer', state: 'approved', commitId: 'head-2' }
    ], 1);
    expect(result.ready).toBe(false);
    expect(result.approvals).toBe(1);
    expect(result.reasons).toEqual(['1 review conversation must be resolved.']);
  });

  test('dismisses approval and change requests from a previous head', () => {
    const result = mergeRequirements(pull, rule, checks, [
      { authorId: 'reviewer', state: 'approved', commitId: 'head-1' },
      { authorId: 'second-reviewer', state: 'changes_requested', commitId: 'head-1' }
    ], 0);
    expect(result.ready).toBe(false);
    expect(result.approvals).toBe(0);
    expect(result.reasons).toEqual(['1 more approval required.']);
  });

  test('blocks pending or absent required checks', () => {
    expect(mergeRequirements(pull, rule, { total: 0, passed: 0, failed: 0, running: 0, items: [] }, [], 0).checksPass).toBe(false);
    expect(mergeRequirements(pull, rule, { total: 1, passed: 0, failed: 0, running: 1, items: [{ name: 'Project checks / Check repository', state: 'running' }] }, [], 0).checksPass).toBe(false);
  });

  test('does not block on optional failing checks', () => {
    const result = mergeRequirements(pull, { ...rule, requiredApprovals: 0 }, { total: 2, passed: 1, failed: 1, running: 0, items: [...checks.items, { name: 'Optional preview', state: 'failure' }] }, [], 0);
    expect(result.ready).toBe(true);
  });
});
