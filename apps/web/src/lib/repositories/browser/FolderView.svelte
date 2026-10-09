<script lang="ts">
  import History from '@lucide/svelte/icons/rotate-ccw-clock';
  import CommitSignature from '#lib/code/CommitSignature.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import { encodeRevision } from '../repository-path';
  import type { CodeLocation } from './entry-path';
  import FileList from './FileList.svelte';
  import PathCrumbs from './PathCrumbs.svelte';
  import type { Tree } from './types';

  let { location, path, tree }: { location: CodeLocation; path: string; tree: Tree } = $props();
  const base = $derived(`/${location.owner}/${location.repository}`);
</script>

{#if path}<PathCrumbs {location} {path} />{/if}
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
        href="{base}/commits/{encodeRevision(location.revision)}"><History size={14} />History</a
      >
    </span>
  {/snippet}
</FileList>
