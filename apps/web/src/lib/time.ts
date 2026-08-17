const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function parsed(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ordinal(dayOfMonth: number) {
  const remainder = dayOfMonth % 100;
  if (remainder >= 11 && remainder <= 13) return `${dayOfMonth}th`;
  return `${dayOfMonth}${dayOfMonth % 10 === 1 ? 'st' : dayOfMonth % 10 === 2 ? 'nd' : dayOfMonth % 10 === 3 ? 'rd' : 'th'}`;
}

export function formatDate(value: string | Date) {
  const date = parsed(value);
  if (!date) return 'Unknown date';
  const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(date);
  return `${month} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

export function formatAbsoluteTime(value: string | Date) {
  const date = parsed(value);
  if (!date) return 'Unknown time';
  const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${formatDate(date)} at ${time}`;
}

export function formatTimestamp(value: string | Date, now = new Date()) {
  const date = parsed(value);
  if (!date) return 'Unknown time';
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < minute) return 'just now';
  if (elapsed < 2 * minute) return 'a minute ago';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} minutes ago`;
  if (elapsed < 2 * hour) return 'an hour ago';
  if (elapsed < day) return `${Math.floor(elapsed / hour)} hours ago`;
  if (elapsed < 2 * day) return 'yesterday';
  if (elapsed < 30 * day) return `${Math.floor(elapsed / day)} days ago`;
  if (elapsed < 60 * day) return 'a month ago';
  if (elapsed < 365 * day) return `${Math.floor(elapsed / (30 * day))} months ago`;
  return formatDate(date);
}

export function timestampGroup(value: string | Date, now = new Date()) {
  const date = parsed(value);
  if (!date) return 'Unknown date';
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today - target) / day);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
  }
  return formatDate(date);
}
