<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestDetail } from '@marl/contracts';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Flag from '@lucide/svelte/icons/flag';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Button from '#lib/components/controls/Button.svelte';
  import WorkItemLinks from '#lib/components/discussion/WorkItemLinks.svelte';
  import WorkItemMetadata from '#lib/components/discussion/WorkItemMetadata.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import PullBrief from './PullBrief.svelte';

  let {
    pull,
    busy,
    context,
    onEdit,
    onUpdate,
    onCreateLabel,
    onReport,
    status
  }: {
    pull: PullRequestDetail;
    busy: boolean;
    context: MarkdownContext;
    onEdit: () => void;
    onUpdate: (body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) => Promise<void>;
    onCreateLabel: (name: string) => Promise<void>;
    onReport?: () => void;
    status: Snippet;
  } = $props();
  let metadataOpen = $state(false);
  const sourceLabel = $derived(
    pull.sourceRepository &&
      `${pull.sourceRepository.owner}/${pull.sourceRepository.name}` !==
        `${pull.repository.owner}/${pull.repository.name}`
      ? `${pull.sourceRepository.owner}:${pull.sourceBranch}`
      : pull.sourceBranch
  );
</script>

{#snippet branch(name: string)}
  <Tooltip text={name}>
    {#snippet children(tooltip)}
      <code {...tooltip} class="min-w-0 truncate rounded-md bg-surface-muted px-2 py-1 font-mono text-xs text-ink"
        >{name}</code
      >
    {/snippet}
  </Tooltip>
{/snippet}

<aside class="grid min-w-0 content-start gap-3 lg:gap-5" aria-label="Pull summary">
  <section class="min-w-0 surface rounded-2xl p-4 sm:p-5">
    <header class="mb-2 flex min-h-7 items-center justify-between gap-3">
      <p class="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
        <WorkItemReference kind="pull" number={pull.number} class="font-medium" />
        <span aria-hidden="true">·</span>
        <span class="truncate">opened <Time value={pull.createdAt} /></span>
      </p>
      {#if pull.canManage}<Button
          icon
          size="small"
          variant="ghost"
          aria-label="Edit pull"
          disabled={busy}
          onclick={onEdit}><Pencil size={15} /></Button
        >{:else if onReport}<Tooltip text="Report pull" as="label">
          {#snippet children(tooltip)}
            <Button icon size="small" variant="ghost" onclick={onReport} {...tooltip}><Flag size={15} /></Button>
          {/snippet}
        </Tooltip>{/if}
    </header>
    <h1 class="text-2xl leading-tight font-semibold tracking-tight text-pretty break-words text-ink-strong">
      {pull.title}
    </h1>
    <div class="mt-4 grid gap-2.5">
      <UserProfileLink
        handle={pull.author}
        displayName={pull.authorDisplayName}
        avatarUrl={pull.authorAvatarUrl}
        kind={pull.authorKind}
        size={22}
      />
      <div
        class="flex min-w-0 items-center gap-1.5 text-ink-faint"
        aria-label="Merging {sourceLabel} into {pull.targetBranch}"
      >
        {@render branch(pull.targetBranch)}<ArrowLeft size={14} class="shrink-0" aria-hidden="true" />{@render branch(
          sourceLabel
        )}
      </div>
    </div>
    {#if pull.bodyText}<div class="mt-5 break-words">
        <PullBrief html={pull.bodyHtml} text={pull.bodyText} title={pull.title} />
      </div>{/if}
    <div class="mt-5">{@render status()}</div>
  </section>
  <Button
    class="w-full justify-between lg:hidden"
    aria-expanded={metadataOpen}
    onclick={() => (metadataOpen = !metadataOpen)}>Assignees and labels<ChevronDown size={15} /></Button
  >
  <div class={['gap-6 px-1 lg:grid lg:px-3.5', metadataOpen ? 'grid' : 'hidden']}>
    <WorkItemLinks items={pull.linkedItems} {context} />
    <WorkItemMetadata item={pull} {busy} {onUpdate} {onCreateLabel} />
  </div>
</aside>
