<script lang="ts">
  import Button from '$lib/components/controls/Button.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';

  let { html, text, title }: { html: string; text: string; title: string } = $props();
  let open = $state(false);
  let fitted = $state<{ text: string; truncated: boolean; more: boolean } | null>(null);
  const hasDocumentContent = $derived(
    /<(?:h[1-6]|ul|ol|pre|table|img|video|details|a|code|strong|em|del|blockquote|hr|input)\b/.test(html)
  );

  function measure(text: string, formatted: boolean) {
    return (element: HTMLElement) => {
      const measurement = element.querySelector<HTMLElement>('.measurement')!;
      const copy = measurement.querySelector<HTMLElement>('.measurement-copy')!;
      const ending = measurement.querySelector<HTMLElement>('.ending')!;
      const ellipsis = ending.querySelector<HTMLElement>('.ellipsis')!;
      const characters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
        (part) => part.segment
      );
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
      const observer = new ResizeObserver(() => {
        if (element.clientWidth !== width) update();
      });
      observer.observe(element);
      void document.fonts.ready.then(update);
      return () => {
        active = false;
        observer.disconnect();
      };
    };
  }
</script>

<div class="relative" {@attach measure(text, hasDocumentContent)}>
  <p class={['text-sm leading-[1.65] break-words text-ink', fitted === null && 'line-clamp-3']}>
    {fitted ? fitted.text : text}{#if fitted?.more || (!fitted && hasDocumentContent)}<span class="whitespace-nowrap"
        >{#if fitted?.truncated}…{/if}
        <button
          type="button"
          class="font-semibold text-ink-strong hover:text-brand hover:underline hover:underline-offset-3"
          aria-haspopup="dialog"
          onclick={() => (open = true)}>Read more</button
        ></span
      >{/if}
  </p>
  <p
    class="measurement pointer-events-none invisible absolute inset-x-0 top-0 text-sm leading-[1.65] break-words [contain:layout_style]"
    aria-hidden="true"
  >
    <span class="measurement-copy"></span><span class="ending whitespace-nowrap"
      ><span class="ellipsis">…</span> <span class="font-semibold">Read more</span></span
    >
  </p>
</div>

<Modal {open} {title} size="large" onClose={() => (open = false)}>
  <MarkdownBody {html} />
  {#snippet actions()}<Button onclick={() => (open = false)}>Close</Button>{/snippet}
</Modal>
