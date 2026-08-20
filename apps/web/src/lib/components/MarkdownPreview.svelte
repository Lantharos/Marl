<script lang="ts">
  import MarkdownBody from './MarkdownBody.svelte';
  import type { MarkdownContext } from '$lib/markdown';
  let { source, context }: { source: string; context?: MarkdownContext } = $props();
  const format = $derived(context && !/\.(?:md|markdown)$/i.test(context.path) ? 'plain' : 'markdown');
</script>

<MarkdownBody {source} {context} {format} variant="document" />
