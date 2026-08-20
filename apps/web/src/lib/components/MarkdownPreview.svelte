<script lang="ts">
  import MarkdownBody from './MarkdownBody.svelte';
  import type { MarkdownContext } from '$lib/markdown';
  let { source, context }: { source: string; context?: MarkdownContext } = $props();
</script>

<MarkdownBody {source} {context} variant="document" />
