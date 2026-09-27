import { describe, expect, test } from 'bun:test';
import { emptyHistory, record, uptime } from './history';
import { parseIncident } from './incidents';

const result = (ok: boolean) => ({ component: 'api' as const, ok, latencyMs: 100, detail: '' });

describe('status history', () => {
  test('accumulates checks per day and drops days older than 90', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    let history = record(emptyHistory(), [result(true)], start);
    history = record(history, [result(false)], new Date('2026-01-01T00:10:00Z'));
    expect(history.components.api.days).toEqual([{ date: '2026-01-01', checks: 2, failures: 1, latencyTotal: 200 }]);
    expect(uptime(history.components.api.days)).toBe(0.5);
    history = record(history, [result(true)], new Date('2026-04-15T00:00:00Z'));
    expect(history.components.api.days.map((day) => day.date)).toEqual(['2026-04-15']);
  });

  test('reads incidents from front matter and paragraphs', () => {
    const incident = parseIncident(
      '2026-10-01-pushes',
      '---\ntitle: Pushes are slow\nstatus: resolved\ncomponents: git, ssh\nstarted: 2026-10-01T10:00:00Z\nresolved: 2026-10-01T11:00:00Z\n---\nWe are looking into it.\n\nFixed.'
    );
    expect(incident.components).toEqual(['git', 'ssh']);
    expect(incident.updates).toEqual(['We are looking into it.', 'Fixed.']);
    expect(incident.resolved).toBe('2026-10-01T11:00:00Z');
  });
});
