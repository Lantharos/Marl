<script lang="ts">
  import type { IssueDetail } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Button from '#lib/components/controls/Button.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import Time from '#lib/components/page/Time.svelte';

  let { issue, onEdit }: { issue: IssueDetail; onEdit: () => void } = $props();
  let expanded = $state(false);
  let overflow = $state(false);

  function measure(node: HTMLElement) {
    const update = () => {
      if (!expanded) overflow = node.scrollHeight > node.clientHeight + 1;
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    const markdown = node.querySelector('.markdown');
    if (markdown) observer.observe(markdown);
    return () => observer.disconnect();
  }
</script>

<article class="surface px-3.5 pt-3 pb-4 sm:px-4" aria-label="Report">
  <header class="flex min-h-8 items-center gap-x-2 text-sm text-ink-muted">
    <UserProfileLink
      handle={issue.author}
      displayName={issue.authorDisplayName}
      avatarUrl={issue.authorAvatarUrl}
      kind={issue.authorKind}
      size={28}
    />
    <Time value={issue.createdAt} class="ml-auto shrink-0 text-xs text-ink-muted" />
    {#if issue.canEdit}<Tooltip text="Edit issue" as="label">
        {#snippet children(tooltip)}<Button
            {...tooltip}
            class="-mr-1.5"
            icon
            size="small"
            variant="ghost"
            onclick={onEdit}><Pencil size={14} /></Button
          >{/snippet}
      </Tooltip>{/if}
  </header>
  <div
    class={['pt-1.5 sm:pl-9', !expanded && 'max-h-150 overflow-hidden', !expanded && overflow && 'mask-b-from-80%']}
    {@attach measure}
  >
    {#if issue.bodyHtml}<MarkdownBody html={issue.bodyHtml} />{:else}<p class="text-sm text-ink-faint italic">
        No description provided.
      </p>{/if}
  </div>
  {#if overflow}<Button
      class="mt-2 sm:ml-7"
      size="small"
      variant="ghost"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
      >{expanded ? 'Show less' : 'Read full description'}<ChevronDown size={14} /></Button
    >{/if}
</article>
