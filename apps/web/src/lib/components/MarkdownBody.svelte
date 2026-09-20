<script lang="ts">
  import { renderMarkdown, type MarkdownContext, type MarkdownFormat } from '$lib/markdown';
  import { enhanceMedia } from '$lib/media/enhance-media';
  import ImageViewer from '$lib/media/ImageViewer.svelte';
  import { enhanceMarkdown } from '$lib/markdown/enhance';
  import '$lib/markdown/styles.css';
  let { source, muted = false, variant = 'compact', context, format = 'markdown' } = $props<{ source: string; muted?: boolean; variant?: 'compact' | 'document'; context?: MarkdownContext; format?: MarkdownFormat }>();
  const scope = $props.id();
  const rendered = $derived(renderMarkdown(source, context, format, scope));
  let viewedImage = $state<{ src: string; alt: string } | null>(null);
</script>

{#key rendered}<div class="markdown" class:muted class:document={variant === 'document'} {@attach (root) => enhanceMedia(root, (image) => (viewedImage = image), variant === 'document')} {@attach enhanceMarkdown}>{@html rendered}</div>{/key}
{#if viewedImage}<ImageViewer src={viewedImage.src} alt={viewedImage.alt} onClose={() => (viewedImage = null)} />{/if}
