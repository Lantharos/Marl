<script lang="ts">
  import type { CodeToken } from './types';

  let { tokens, text }: { tokens?: CodeToken[]; text: string } = $props();
</script>

{#if tokens?.length}{#each tokens as token, index (index)}<span
      class="syntax-token"
      style:--syntax-light={token.light}
      style:--syntax-dark={token.dark}>{token.text}</span
    >{/each}{:else}{text || ' '}{/if}
