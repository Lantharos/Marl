import { onDestroy, untrack } from 'svelte';
import { page } from '$app/state';
import { forgetContent, parentFolder, rememberFolders } from '../content-cache.svelte';
import type { Folders } from '../types';
import { FileTree } from './file-tree.svelte';

type BrowsedRepository = { owner: string; name: string; defaultBranch: string };

export class CodeBrowser {
  readonly #repository: () => BrowsedRepository;
  readonly owner = $derived.by(() => this.#repository().owner);
  readonly name = $derived.by(() => this.#repository().name);
  readonly defaultBranch = $derived.by(() => this.#repository().defaultBranch);
  readonly revision = $derived(page.params.revision ?? this.defaultBranch);
  readonly selectedFile = $derived(page.data.selectedFile as string | undefined);
  readonly current = $derived(page.params.path ?? this.selectedFile ?? '');
  readonly file = $derived(Boolean(page.route.id?.includes('/blob/')) || this.selectedFile !== undefined);
  readonly openFolder = $derived(this.file ? parentFolder(this.current) : this.current);
  readonly folders = $derived((page.data.folders ?? {}) as Folders);
  readonly entry = $derived(
    this.file ? this.folders[parentFolder(this.current)]?.entries.find((item) => item.path === this.current) : undefined
  );
  readonly tree = $derived.by(() => {
    const location = {
      owner: this.owner,
      repository: this.name,
      revision: this.revision,
      defaultBranch: this.defaultBranch
    };
    return untrack(() => new FileTree(location, () => this.folders, this.openFolder));
  });

  constructor(repository: () => BrowsedRepository) {
    this.#repository = repository;

    $effect.pre(() => {
      const tree = this.tree;
      const folder = this.openFolder;
      untrack(() => tree.reveal(folder));
    });

    $effect(() => {
      const location = this.tree.location;
      const loaded = this.folders;
      untrack(() => rememberFolders(location, loaded));
    });

    onDestroy(forgetContent);
  }
}
