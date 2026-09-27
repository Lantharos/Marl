<script lang="ts">
  let {
    additions,
    deletions,
    class: className = ''
  }: { additions: number; deletions: number; class?: string } = $props();
</script>

<span class={['inline-flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums', className]}
  ><span class="text-success">+{additions.toLocaleString()}</span><span class="text-danger"
    >−{deletions.toLocaleString()}</span
  ></span
>
