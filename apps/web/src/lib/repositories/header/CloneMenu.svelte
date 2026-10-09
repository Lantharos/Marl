<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Code2 from '@lucide/svelte/icons/code-xml';
  import Button from '#lib/components/controls/Button.svelte';
  import Popover from '#lib/components/overlays/Popover.svelte';
  import CloneUrl from './CloneUrl.svelte';

  let { cloneUrl, sshCloneUrl, signedIn }: { cloneUrl: string; sshCloneUrl: string; signedIn: boolean } = $props();
</script>

<Popover class="w-[min(380px,calc(100vw-28px))] rounded-2xl p-4" role="dialog" aria-label="Clone repository">
  {#snippet trigger(popover)}
    <Button size="small" aria-label="Clone repository" {...popover}
      ><Code2 size={15} /><span class="max-sm:hidden">Clone</span><ChevronDown size={13} /></Button
    >
  {/snippet}
  <CloneUrl heading="Clone this repository" {cloneUrl} {sshCloneUrl} {signedIn} />
</Popover>
