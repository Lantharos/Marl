<script lang="ts">
  import type { LinkedWorkItem } from '@marl/contracts';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import { itemHref } from '../store/refs';
  import InspectorSection from './InspectorSection.svelte';

  let { items }: { items: LinkedWorkItem[] } = $props();
</script>

{#if items.length}
  <InspectorSection title="Linked work">
    <ul class="-mx-2 grid gap-px">
      {#each items as item (`${item.kind}:${item.id}`)}
        <li>
          <a
            href={itemHref({
              kind: item.kind,
              owner: item.repository.owner,
              repo: item.repository.name,
              number: item.number
            })}
            class="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
          >
            <WorkItemStateIcon kind={item.kind} state={item.state} size={14} />
            <span class="min-w-0">
              <span class="line-clamp-2 text-sm leading-snug text-ink-strong">{item.title}</span>
              <span class="text-xs text-ink-muted"
                ><WorkItemReference kind={item.kind} number={item.number} />{#if item.closes}
                  · closes on merge{/if}</span
              >
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </InspectorSection>
{/if}
