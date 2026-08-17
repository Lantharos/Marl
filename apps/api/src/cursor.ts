export interface PageCursor {
  value: string;
  id: string;
  rank?: number;
}

export function pageSize(url: URL, fallback = 100, maximum = 100) {
  const requested = Number(url.searchParams.get('limit'));
  return Number.isInteger(requested) ? Math.min(Math.max(requested, 1), maximum) : fallback;
}

export function readCursor(url: URL): PageCursor | null {
  const encoded = url.searchParams.get('cursor');
  if (!encoded) return null;
  try {
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(base64)) as Partial<PageCursor>;
    return typeof parsed.value === 'string' && typeof parsed.id === 'string' && (parsed.rank === undefined || Number.isInteger(parsed.rank))
      ? parsed as PageCursor
      : null;
  } catch {
    return null;
  }
}

export function writeCursor(cursor: PageCursor) {
  return btoa(JSON.stringify(cursor)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function pageResult<T>(rows: T[], limit: number, cursorFor: (row: T) => PageCursor) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore && items.length ? writeCursor(cursorFor(items.at(-1)!)) : null };
}
