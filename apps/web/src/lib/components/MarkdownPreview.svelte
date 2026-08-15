<script lang="ts">
  let { source }: { source: string } = $props();
  type Block = { type: 'heading' | 'paragraph' | 'code' | 'list'; level?: number; text?: string; lines?: string[] };
  const blocks = $derived(parse(source));

  function parse(value: string): Block[] {
    const lines = value.replaceAll('\r\n', '\n').split('\n');
    const output: Block[] = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      if (line.startsWith('```')) {
        const code: string[] = []; index += 1;
        while (index < lines.length && !lines[index].startsWith('```')) { code.push(lines[index]); index += 1; }
        output.push({ type: 'code', lines: code }); index += 1; continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) { output.push({ type: 'heading', level: heading[1].length, text: heading[2] }); index += 1; continue; }
      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index])) { items.push(lines[index].replace(/^[-*]\s+/, '')); index += 1; }
        output.push({ type: 'list', lines: items }); continue;
      }
      const paragraph: string[] = [];
      while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+/.test(lines[index]) && !lines[index].startsWith('```') && !/^[-*]\s+/.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1; }
      output.push({ type: 'paragraph', text: paragraph.join(' ') });
    }
    return output;
  }
</script>

{#each blocks as block}
  {#if block.type === 'heading'}
    {#if block.level === 1}<h1>{block.text}</h1>{:else}<h2>{block.text}</h2>{/if}
  {:else if block.type === 'paragraph'}<p>{block.text}</p>
  {:else if block.type === 'code'}<pre><code>{block.lines?.join('\n')}</code></pre>
  {:else if block.type === 'list'}<ul>{#each block.lines ?? [] as item}<li>{item}</li>{/each}</ul>{/if}
{/each}

<style>
  h1 { margin: 0 0 8px; color: var(--text-strong); font-size: 26px; font-weight: 700; letter-spacing: -.035em; } h2 { margin: 28px 0 9px; padding-bottom: 7px; border-bottom: 1px solid var(--border); color: var(--text-strong); font-size: 17px; font-weight: 660; letter-spacing: -.02em; } p, li { color: var(--text); font-size: 12px; line-height: 1.65; } p:first-of-type { color: var(--text-muted); font-size: 14px; } ul { padding-left: 20px; } pre { overflow-x: auto; margin: 12px 0 0; padding: 13px 14px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface-muted); color: var(--text-strong); font-family: "SFMono-Regular",Consolas,monospace; font-size: 11px; line-height: 1.65; }
</style>
