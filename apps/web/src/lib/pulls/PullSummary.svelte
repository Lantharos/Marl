<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestDetail } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Flag from '@lucide/svelte/icons/flag';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Button from '$lib/components/controls/Button.svelte';
  import PullBrief from './PullBrief.svelte';
  import PullStackLinks from './PullStackLinks.svelte';
  import WorkItemMetadata from '$lib/components/discussion/WorkItemMetadata.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import WorkItemLinks from '$lib/components/discussion/WorkItemLinks.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';
  import { pullDetailSignal } from './pull-signal';

  let {
    pull,
    conflicted = false,
    busy,
    context,
    onEdit,
    onUpdate,
    onCreateLabel,
    onReport,
    actions
  }: {
    pull: PullRequestDetail;
    conflicted?: boolean;
    busy: boolean;
    context: MarkdownContext;
    onEdit: () => void;
    onUpdate: (body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) => Promise<void>;
    onCreateLabel: (name: string) => Promise<void>;
    onReport?: () => void;
    actions: Snippet;
  } = $props();
  let metadataOpen = $state(false);
  const signal = $derived(pullDetailSignal(pull, conflicted));
  const tones = {
    working: 'bg-brand',
    attention: 'bg-danger',
    ready: 'bg-success',
    complete: 'bg-merged',
    quiet: 'bg-ink-muted'
  };
</script>

<aside class="grid min-w-0 content-start gap-3 lg:gap-5" aria-label="Pull summary">
  <section class="min-w-0 surface rounded-2xl p-4 sm:p-5">
    <header class="mb-2 flex min-h-7 items-center justify-between">
      <span class="text-sm text-ink-muted tabular-nums">!{pull.number}</span>
      {#if pull.canManage}<Button
          icon
          size="small"
          variant="ghost"
          aria-label="Edit pull"
          disabled={busy}
          onclick={onEdit}><Pencil size={15} /></Button
        >{:else if onReport}<Button
          icon
          size="small"
          variant="ghost"
          aria-label="Report pull"
          title="Report pull"
          onclick={onReport}><Flag size={15} /></Button
        >{/if}
    </header>
    <h1
      class="text-[clamp(23px,2vw,29px)] leading-[1.18] font-semibold tracking-[-0.035em] text-pretty break-words text-ink-strong"
    >
      {pull.title}
    </h1>
    <div class="mt-4.5 mb-5.5 flex items-center gap-2 text-sm font-semibold text-ink-strong">
      <span class={['size-2 rounded-full', tones[signal.tone]]} aria-hidden="true"></span>{signal.label}
    </div>
    <UserProfileLink
      handle={pull.author}
      displayName={pull.authorDisplayName}
      avatarUrl={pull.authorAvatarUrl}
      kind={pull.authorKind}
      size={22}
    />
    <div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-ink-muted">
      <code
        class="max-w-full truncate rounded-md bg-surface-muted px-2 py-1 font-mono text-xs"
        title={pull.sourceBranch}>{pull.sourceBranch}</code
      ><ArrowRight size={14} /><code
        class="max-w-full truncate rounded-md bg-surface-muted px-2 py-1 font-mono text-xs"
        title={pull.targetBranch}>{pull.targetBranch}</code
      >
    </div>
    <PullStackLinks stack={pull.stack} repository="{pull.repository.owner}/{pull.repository.name}" />
    {#if pull.bodyText}<div class="my-5.5 break-words">
        <PullBrief html={pull.bodyHtml} text={pull.bodyText} title={pull.title} />
      </div>{:else}<div class="h-5.5"></div>{/if}
    {@render actions()}
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
