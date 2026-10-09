<script lang="ts">
  import type { ClassValue } from 'svelte/elements';

  let {
    kind,
    number,
    repository,
    class: className
  }: { kind: 'issue' | 'pull'; number: number | string; repository?: string; class?: ClassValue } = $props();
</script>

<span class={['whitespace-nowrap tabular-nums', className]}
  >{repository ?? ''}<span class="reference-sigil">{kind === 'issue' ? '#' : '!'}</span>{number}</span
>
