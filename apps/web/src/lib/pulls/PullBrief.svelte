<script lang="ts">
  import sanitizeHtml from 'sanitize-html';
  import Button from '$lib/components/Button.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { renderMarkdown, type MarkdownContext } from '$lib/markdown';

  let { body, title, context } = $props<{ body: string; title: string; context: MarkdownContext }>();
  let open = $state(false);
  let fitted = $state<{ text: string; truncated: boolean; more: boolean } | null>(null);
  const rendered = $derived(renderMarkdown(body, context));
  const preview = $derived(sanitizeHtml(
    rendered.replace(/<\/(?:p|h[1-6]|li|tr|blockquote|pre|div)>|<br\s*\/?>/g, ' '),
    { allowedTags: [], allowedAttributes: {}, transformTags: { img: (_tag, attributes) => ({ tagName: 'span', attribs: {}, text: attributes.alt || 'Image' }) } }
  ).trim());
  const hasDocumentContent = $derived(/<(?:h[1-6]|ul|ol|pre|table|img|video|details|a|code|strong|em|del|blockquote|hr|input)\b/.test(rendered));

  function measure(html: string, formatted: boolean) {
    return (element: HTMLElement) => {
      const measurement = element.querySelector<HTMLElement>('.measurement')!;
      const copy = measurement.querySelector<HTMLElement>('.measurement-copy')!;
      const ending = measurement.querySelector<HTMLElement>('.ending')!;
      const ellipsis = ending.querySelector<HTMLElement>('.ellipsis')!;
      const text = new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const characters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment);
      let active = true;
      let width = 0;
      const update = () => {
        if (!active || !element.clientWidth) return;
        width = element.clientWidth;
        const limit = Number.parseFloat(getComputedStyle(measurement).lineHeight) * 3 + 1;
        copy.textContent = text;
        ending.hidden = !formatted;
        ellipsis.hidden = true;
        if (measurement.offsetHeight <= limit) {
          fitted = { text, truncated: false, more: formatted };
          return;
        }
        ending.hidden = false;
        ellipsis.hidden = false;
        let low = 0;
        let high = characters.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          copy.textContent = characters.slice(0, middle).join('').trimEnd();
          if (measurement.offsetHeight <= limit) low = middle;
          else high = middle - 1;
        }
        let excerpt = characters.slice(0, low).join('').trimEnd();
        if (characters[low]?.trim()) excerpt = excerpt.replace(/\s+\S*$/, '');
        fitted = { text: excerpt, truncated: true, more: true };
      };
      const observer = new ResizeObserver(() => { if (element.clientWidth !== width) update(); });
      observer.observe(element);
      void document.fonts.ready.then(update);
      return () => { active = false; observer.disconnect(); };
    };
  }
</script>

<div class="brief-preview" {@attach measure(preview, hasDocumentContent)}>
  <p class="preview" class:measured={fitted !== null}>
    {#if fitted}{fitted.text}{:else}{@html preview}{/if}{#if fitted?.more || (!fitted && hasDocumentContent)}<span class="ending">{#if fitted?.truncated}…{/if} <Button class="read-more" variant="ghost" aria-haspopup="dialog" onclick={() => (open = true)}>Read more</Button></span>{/if}
  </p>
  <p class="measurement" aria-hidden="true"><span class="measurement-copy"></span><span class="ending"><span class="ellipsis">…</span> <span class="read-more-label">Read more</span></span></p>
</div>

<Modal {open} {title} onClose={() => (open = false)} --modal-width="720px">
  <div class="full-brief"><MarkdownBody source={body} {context} /></div>
  {#snippet actions()}<Button onclick={() => (open = false)}>Close</Button>{/snippet}
</Modal>

<style>
  .brief-preview{position:relative}
  .preview,.measurement{margin:0;color:var(--text);font-size:13px;line-height:1.65;overflow-wrap:anywhere}
  .preview:not(.measured){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3;overflow:hidden}
  .measurement{position:absolute;inset:0 0 auto;visibility:hidden;pointer-events:none;contain:layout style}
  .ending{white-space:nowrap}
  .brief-preview :global(.read-more.button),.read-more-label{display:inline;min-height:0;margin:0;padding:0;border:0;border-radius:2px;background:none;color:var(--text-strong);font:inherit;font-weight:600;vertical-align:baseline}
  .brief-preview :global(.read-more.button:hover){background:none;color:var(--brand);text-decoration:underline;text-underline-offset:3px}
  .full-brief{min-width:0;--markdown-font-size:14px}
</style>
