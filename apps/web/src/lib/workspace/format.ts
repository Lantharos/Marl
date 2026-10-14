import { isoTimestamp } from '#lib/time.js';

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export function compactAge(value: string, now = Date.now()) {
  const timestamp = isoTimestamp(value);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < minute) return 'now';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)}d`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}
