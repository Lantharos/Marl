<script lang="ts">
  import { enhanceMedia } from '$lib/media/enhance-media';
  import ImageViewer from '$lib/media/ImageViewer.svelte';
  import { enhanceMarkdown } from '$lib/markdown/enhance';
  import '$lib/markdown/styles/base.css';
  import '$lib/markdown/styles/document.css';
  import '$lib/markdown/styles/extensions.css';
  import '$lib/markdown/styles/code.css';

  let {
    html,
    muted = false,
    variant = 'compact',
    class: className = ''
  }: { html: string; muted?: boolean; variant?: 'compact' | 'document'; class?: string } = $props();
  let viewedImage = $state<{ src: string; alt: string } | null>(null);
</script>

{#key html}<div
    class={['markdown', muted && 'muted', variant === 'document' && 'document', className]}
    {@attach (root) => enhanceMedia(root, (image) => (viewedImage = image), variant === 'document')}
    {@attach enhanceMarkdown}
  >
    {@html html}
  </div>{/key}
{#if viewedImage}<ImageViewer src={viewedImage.src} alt={viewedImage.alt} onClose={() => (viewedImage = null)} />{/if}
