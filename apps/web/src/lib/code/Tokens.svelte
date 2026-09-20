<script lang="ts">
  import type { CodeToken } from './types';
  let { tokens, text } = $props<{ tokens?: CodeToken[]; text: string }>();
</script>
{#if tokens?.length}{#each tokens as token, index (index)}<span style:--syntax-light={token.light} style:--syntax-dark={token.dark}>{token.text}</span>{/each}{:else}{text || ' '}{/if}
<style>
  span{color:var(--syntax-light)}:global(:root:not([data-theme='light'])) span{color:var(--syntax-dark)}
</style>
