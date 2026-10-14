<script lang="ts">
  import type { RepositorySummary } from '@marl/contracts';
  import { avatarTone } from '#lib/components/identity/initials.js';

  let { repository }: { repository: RepositorySummary } = $props();
  const tone = $derived(avatarTone(`${repository.owner}/${repository.name}`));
</script>

{#if repository.iconUrl}
  <img src={repository.iconUrl} alt="" class="size-6 rounded-md object-cover" />
{:else}
  <span
    class="grid size-6 place-items-center rounded-md text-xs font-semibold"
    style:background="var(--color-avatar-{tone})"
    style:color="var(--color-on-avatar-{tone})"
    aria-hidden="true">{repository.name.slice(0, 1).toUpperCase()}</span
  >
{/if}
