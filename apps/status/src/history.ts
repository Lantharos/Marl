import type { ComponentId, ProbeResult } from './probes';

export type DayBucket = { date: string; checks: number; failures: number; latencyTotal: number };
export type History = {
  updatedAt: string;
  components: Record<ComponentId, { days: DayBucket[]; last: ProbeResult | null }>;
};

const retainedDays = 90;

export function emptyHistory(): History {
  const empty = () => ({ days: [], last: null });
  return {
    updatedAt: new Date(0).toISOString(),
    components: { web: empty(), api: empty(), git: empty(), ssh: empty() }
  };
}

export async function publishedHistory(url: string): Promise<History> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response?.ok) return emptyHistory();
  const history = (await response.json().catch(() => null)) as History | null;
  return history?.components
    ? { ...emptyHistory(), ...history, components: { ...emptyHistory().components, ...history.components } }
    : emptyHistory();
}

export function record(history: History, results: ProbeResult[], now = new Date()): History {
  const date = now.toISOString().slice(0, 10);
  const oldest = new Date(now.getTime() - (retainedDays - 1) * 86_400_000).toISOString().slice(0, 10);
  const components = { ...history.components };
  for (const result of results) {
    const days = components[result.component].days.filter((day) => day.date >= oldest && day.date !== date);
    const today = components[result.component].days.find((day) => day.date === date) ?? {
      date,
      checks: 0,
      failures: 0,
      latencyTotal: 0
    };
    days.push({
      date,
      checks: today.checks + 1,
      failures: today.failures + (result.ok ? 0 : 1),
      latencyTotal: today.latencyTotal + result.latencyMs
    });
    components[result.component] = { days, last: result };
  }
  return { updatedAt: now.toISOString(), components };
}

export function uptime(days: DayBucket[]) {
  const checks = days.reduce((sum, day) => sum + day.checks, 0);
  const failures = days.reduce((sum, day) => sum + day.failures, 0);
  return checks ? (checks - failures) / checks : null;
}
