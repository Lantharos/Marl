import { isoTimestamp } from '#lib/time.js';

export function instant(value: string | null | undefined) {
  const iso = value ? isoTimestamp(value) : null;
  return iso ? Date.parse(iso) : null;
}

export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 1) return '<1s';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function elapsed(startedAt: string | null | undefined, completedAt: string | null | undefined, now: number) {
  const start = instant(startedAt);
  if (start === null) return null;
  return formatDuration((instant(completedAt) ?? now) - start);
}
