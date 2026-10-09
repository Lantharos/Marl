import { base64Url, fromBase64Url } from '../core/encoding';
interface PageCursor {
  value: string;
  id: string;
  rank?: number;
}

export function pageSize(url: URL, fallback = 100, maximum = 100) {
  const raw = url.searchParams.get('limit');
  const requested = raw === null ? NaN : Number(raw);
  return Number.isInteger(requested) ? Math.min(Math.max(requested, 1), maximum) : fallback;
}

export function readCursor(url: URL): PageCursor | null {
  const encoded = url.searchParams.get('cursor');
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as Partial<PageCursor>;
    return typeof parsed.value === 'string' &&
      typeof parsed.id === 'string' &&
      (parsed.rank === undefined || Number.isInteger(parsed.rank))
      ? (parsed as PageCursor)
      : null;
  } catch {
    return null;
  }
}

export function writeCursor(cursor: PageCursor) {
  return base64Url(new TextEncoder().encode(JSON.stringify(cursor)));
}

export function pageResult<T>(rows: T[], limit: number, cursorFor: (row: T) => PageCursor) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore && items.length ? writeCursor(cursorFor(items.at(-1)!)) : null };
}
