import { MarlApiError } from '#lib/api.js';

export type CursorPage<T> = { items: T[]; nextCursor: string | null };

class LoadedPages<T extends { id: string }> {
  items = $state.raw<T[]>([]);
  nextCursor = $state<string | null>(null);
  loading = $state(false);
  error = $state('');

  constructor(first: CursorPage<T>) {
    this.items = first.items;
    this.nextCursor = first.nextCursor;
  }

  append(page: CursorPage<T>) {
    const known = new Set(this.items.map((item) => item.id));
    this.items = [...this.items, ...page.items.filter((item) => !known.has(item.id))];
    this.nextCursor = page.nextCursor;
  }
}

export class CursorList<T extends { id: string }> {
  #pages: LoadedPages<T>;
  #fetchPage: (cursor: string) => Promise<CursorPage<T>>;
  #failure: string;

  constructor(first: () => CursorPage<T>, fetchPage: (cursor: string) => Promise<CursorPage<T>>, failure: string) {
    this.#pages = $derived(new LoadedPages(first()));
    this.#fetchPage = fetchPage;
    this.#failure = failure;
  }

  get items() {
    return this.#pages.items;
  }

  set items(items: T[]) {
    this.#pages.items = items;
  }

  get nextCursor() {
    return this.#pages.nextCursor;
  }

  set nextCursor(cursor: string | null) {
    this.#pages.nextCursor = cursor;
  }

  get loading() {
    return this.#pages.loading;
  }

  get error() {
    return this.#pages.error;
  }

  loadMore = async () => {
    const pages = this.#pages;
    if (!pages.nextCursor || pages.loading) return;
    pages.loading = true;
    pages.error = '';
    try {
      pages.append(await this.#fetchPage(pages.nextCursor));
    } catch (cause) {
      pages.error = cause instanceof MarlApiError ? cause.message : this.#failure;
    } finally {
      pages.loading = false;
    }
  };
}
