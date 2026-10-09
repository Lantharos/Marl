import { SvelteSet } from 'svelte/reactivity';
import { cachedFolder, folderChain, loadFolder } from '../content-cache.svelte';
import type { CodeLocation } from '../entry-path';
import type { Folders, TreeEntry } from '../types';

export type TreeRow =
  | { kind: 'entry'; key: string; entry: TreeEntry; depth: number; expanded: boolean }
  | { kind: 'status'; key: string; path: string; depth: number; failed: boolean };

export class FileTree {
  readonly location: CodeLocation;
  readonly expanded: SvelteSet<string>;
  readonly failed = new SvelteSet<string>();
  readonly rows = $derived.by(() => this.#flatten('', 0, []));
  #seeded: () => Folders;

  constructor(location: CodeLocation, seeded: () => Folders, openFolder: string) {
    this.location = location;
    this.#seeded = seeded;
    this.expanded = new SvelteSet(folderChain(openFolder).filter(Boolean));
  }

  entries(path: string) {
    return cachedFolder(this.location, path)?.entries ?? this.#seeded()[path]?.entries;
  }

  reveal(folder: string) {
    for (const ancestor of folderChain(folder)) if (ancestor) this.expand(ancestor);
  }

  expand(path: string) {
    this.expanded.add(path);
    this.load(path);
  }

  collapse(path: string) {
    this.expanded.delete(path);
  }

  toggle(path: string) {
    if (this.expanded.has(path)) this.collapse(path);
    else this.expand(path);
  }

  load(path: string) {
    if (this.entries(path)) return;
    this.failed.delete(path);
    loadFolder(fetch, this.location, path).catch(() => this.failed.add(path));
  }

  #flatten(path: string, depth: number, rows: TreeRow[]) {
    for (const entry of this.entries(path) ?? []) {
      const expanded = entry.kind === 'tree' && this.expanded.has(entry.path);
      rows.push({ kind: 'entry', key: entry.path, entry, depth, expanded });
      if (!expanded) continue;
      if (this.entries(entry.path)) this.#flatten(entry.path, depth + 1, rows);
      else
        rows.push({
          kind: 'status',
          key: `${entry.path}/`,
          path: entry.path,
          depth: depth + 1,
          failed: this.failed.has(entry.path)
        });
    }
    return rows;
  }
}
