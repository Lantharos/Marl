<script lang="ts">
  import History from '@lucide/svelte/icons/rotate-ccw-clock';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import type { RevisionLocation } from '#lib/repositories/browser/entry-path.js';
  import type { TreeEntry } from '#lib/repositories/browser/types.js';
  import { encodeRevision } from '#lib/repositories/repository-path.js';
  import InspectorSection from '../inspector/InspectorSection.svelte';

  let { entry, location }: { entry: TreeEntry; location: RevisionLocation } = $props();
  const base = $derived(`/${location.owner}/${location.repository}`);
</script>

<InspectorSection title="Latest change">
  {#if entry.commitId}
    {#if entry.author}<UserProfileLink displayName={entry.author} size={20} class="text-sm" />{/if}
    <a
      class="-mx-2 mt-1 block rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
      href="{base}/commit/{entry.commitId}"
    >
      <span class="line-clamp-2 text-sm leading-snug text-ink-strong">{entry.message}</span>
      <span class="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
        <code class="font-mono">{entry.commitId.slice(0, 7)}</code>
        {#if entry.updatedAt}·<Time value={entry.updatedAt} />{/if}
      </span>
    </a>
  {/if}
  <a
    class="-mx-2 mt-1 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-hover hover:text-ink-strong"
    href="{base}/commits/{encodeRevision(location.revision)}"><History size={15} class="text-ink-muted" />History</a
  >
</InspectorSection>
