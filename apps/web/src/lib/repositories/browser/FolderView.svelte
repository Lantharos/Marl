<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import History from '@lucide/svelte/icons/rotate-ccw-clock';
  import CommitSignature from '#lib/code/CommitSignature.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import { encodeRevision } from '../repository-path';
  import { blobHref, type CodeLocation } from './entry-path';
  import FileList from './FileList.svelte';
  import type { RenderedDocument, Tree, TreeEntry } from './types';

  let {
    location,
    path,
    tree,
    readme
  }: {
    location: CodeLocation;
    path: string;
    tree: Tree;
    readme: { entry: TreeEntry; document: Promise<RenderedDocument | null> } | null;
  } = $props();
  const base = $derived(`/${location.owner}/${location.repository}`);
</script>

<FileList
  {location}
  entries={tree.entries}
  parentPath={path ? path.split('/').slice(0, -1).join('/') : undefined}
  empty={path ? 'This folder is empty.' : 'This branch is empty.'}
>
  {#snippet header()}
    <UserProfileLink
      handle={tree.commit.authorHandle}
      displayName={tree.commit.authorDisplayName || tree.commit.author}
      avatarUrl={tree.commit.authorAvatarUrl}
      size={22}
      class="text-sm font-semibold"
    />
    <a class="min-w-0 flex-1 truncate text-sm text-ink-muted hover:text-brand" href="{base}/commit/{tree.commit.id}"
      >{tree.commit.title}</a
    >
    <span class="flex items-center gap-3">
      <CommitSignature status={tree.commit.signatureStatus} />
      <a class="font-mono text-xs text-ink-muted hover:text-brand" href="{base}/commit/{tree.commit.id}"
        >{tree.commit.shortId}</a
      >
      <a
        class="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-brand"
        href="{base}/commits/{encodeRevision(location.revision)}"
        aria-label="History"><History size={14} /><span class="max-sm:hidden">History</span></a
      >
    </span>
  {/snippet}
</FileList>

{#if readme}
  {#await readme.document then document}
    {#if document}
      <section class="mt-6 overflow-hidden surface" aria-label={readme.entry.name}>
        <header class="flex min-h-12 items-center border-b border-line-subtle bg-surface-muted/60 px-4">
          <a
            class="inline-flex items-center gap-2 text-sm font-semibold text-ink-strong hover:text-brand"
            href={blobHref(location, readme.entry.path)}
            ><BookOpen size={15} class="text-ink-muted" />{readme.entry.name}</a
          >
        </header>
        <div class="px-5 py-6 sm:px-8 sm:py-8"><MarkdownBody html={document.html} variant="document" /></div>
      </section>
    {/if}
  {/await}
{/if}
