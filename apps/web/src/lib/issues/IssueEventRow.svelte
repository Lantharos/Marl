<script lang="ts">
  import type { IssueEvent } from '@marl/contracts';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { issueEventCopy } from './issue-discussion';

  let { event, sequence, createdAt, id }: { event: IssueEvent; sequence: number; createdAt: string; id?: string } =
    $props();
</script>

<article {id} class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 text-sm text-ink-muted">
  <p class="min-w-0">
    <UserProfileLink handle={event.actor} displayName={event.actorDisplayName} avatar={false} class="text-sm" />
    {issueEventCopy(event)}
    {#if event.kind === 'closed_by_pull'}<a
        class="font-medium text-ink hover:text-brand"
        href="/{event.details.owner}/{event.details.repository}/pulls/{event.details.number}"
        >{event.details.owner}/{event.details.repository}!{event.details.number}</a
      >{/if}
  </p>
  <Time value={createdAt} class="text-xs text-ink-faint" />
  <span class="block h-px w-full" data-read-sequence={sequence} aria-hidden="true"></span>
</article>
