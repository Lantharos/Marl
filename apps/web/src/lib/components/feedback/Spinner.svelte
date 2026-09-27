<script lang="ts">
  let { class: className = '' }: { class?: string } = $props();
</script>

<span
  class={['inline-block size-3 animate-spin rounded-full border-2 border-current border-r-transparent', className]}
  aria-hidden="true"
></span>
