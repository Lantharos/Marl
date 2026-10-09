<script lang="ts">
  import type { PullRevisionReviewer } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import UserAvatar from '#lib/components/identity/UserAvatar.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';

  let { reviewers }: { reviewers: PullRevisionReviewer[] } = $props();

  const outcomes = {
    approved: { verb: 'approved', icon: Check, class: 'bg-success text-surface' },
    changes_requested: { verb: 'requested changes', icon: RotateCcw, class: 'bg-warning text-surface' },
    commented: { verb: 'reviewed', icon: MessageSquare, class: 'bg-ink-faint text-surface' }
  };
</script>

<ul class="flex items-center gap-2" aria-label="Reviewers">
  {#each reviewers as reviewer (reviewer.id)}
    {@const outcome = outcomes[reviewer.state]}
    <li class="relative">
      <Tooltip text={`${reviewer.displayName} ${outcome.verb}`} as="label">
        {#snippet children(tooltip)}
          <a {...tooltip} href="/{reviewer.handle}" class="relative block rounded-full">
            <UserAvatar name={reviewer.displayName} src={reviewer.avatarUrl} size={24} />
            <span
              class={[
                'absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full ring-2 ring-surface-muted',
                outcome.class
              ]}
              aria-hidden="true"><outcome.icon size={8} strokeWidth={3.5} /></span
            >
          </a>
        {/snippet}
      </Tooltip>
    </li>
  {/each}
</ul>
