<script lang="ts">
  let { text, ranges }: { text: string; ranges: Array<[number, number]> } = $props();
  const segments = $derived.by(() => {
    const parts: Array<{ text: string; matched: boolean }> = [];
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) parts.push({ text: text.slice(cursor, start), matched: false });
      parts.push({ text: text.slice(Math.max(start, cursor), end), matched: true });
      cursor = Math.max(cursor, end);
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });
    return parts;
  });
</script>

{#each segments as segment, index (index)}{#if segment.matched}<mark
      class="rounded-[3px] bg-brand-soft px-px text-ink-strong ring-1 ring-brand/30">{segment.text}</mark
    >{:else}{segment.text}{/if}{/each}
