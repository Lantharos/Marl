<script lang="ts">
  import { onMount } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Search from '@lucide/svelte/icons/search';
  import Button from '$lib/components/controls/Button.svelte';
  import Tokens from './Tokens.svelte';
  import { codeLanguage, highlight } from './highlight/highlight';
  import type { CodeLines } from './types';

  let { content, path }: { content: string; path: string } = $props();
  const lines = $derived(content.split('\n'));
  let tokens = $state.raw<CodeLines>([]);
  let viewport = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let height = $state(600);
  let query = $state('');
  let match = $state(-1);
  let selected = $state<[number, number] | null>(null);
  const rowHeight = 24;
  const start = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - 12));
  const end = $derived(Math.min(lines.length, start + Math.ceil(height / rowHeight) + 24));
  const matches = $derived(
    query ? lines.flatMap((line, index) => (line.toLowerCase().includes(query.toLowerCase()) ? [index] : [])) : []
  );

  $effect(() => {
    const abort = new AbortController();
    tokens = [];
    void highlight(content, codeLanguage(path), abort.signal).then((result) => {
      if (!abort.signal.aborted) tokens = result;
    });
    return () => abort.abort();
  });
  function jump(line: number) {
    if (viewport) viewport.scrollTop = Math.max(0, (line - 1) * rowHeight - rowHeight * 3);
  }
  function find(direction: number) {
    if (!matches.length) return;
    match = (match + direction + matches.length) % matches.length;
    selected = [matches[match] + 1, matches[match] + 1];
    jump(matches[match] + 1);
  }
  function choose(event: MouseEvent, line: number) {
    event.preventDefault();
    selected = event.shiftKey && selected ? [Math.min(selected[0], line), Math.max(selected[0], line)] : [line, line];
    history.replaceState(history.state, '', `#L${selected[0]}${selected[1] !== selected[0] ? `-L${selected[1]}` : ''}`);
  }
  onMount(() => {
    const readHash = () => {
      const found = /^#L(\d+)(?:-L?(\d+))?$/.exec(location.hash);
      if (found) {
        selected = [Number(found[1]), Number(found[2] ?? found[1])];
        jump(selected[0]);
      }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  });
</script>

<div class="flex min-h-11 flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-1.5 text-sm">
  <Search size={14} class="shrink-0 text-ink-faint" />
  <input
    aria-label="Find in file"
    placeholder="Find in file"
    bind:value={query}
    oninput={() => {
      match = -1;
    }}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        find(event.shiftKey ? -1 : 1);
      }
    }}
    class="h-8 min-w-25 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint"
  />
  {#if query}
    <span class="text-xs text-ink-muted tabular-nums"
      >{matches.length ? `${match + 1 > 0 ? match + 1 : 0} of ${matches.length}` : 'No matches'}</span
    >
    <Button
      size="small"
      icon
      variant="ghost"
      aria-label="Previous match"
      disabled={!matches.length}
      onclick={() => find(-1)}><ChevronUp size={16} /></Button
    >
    <Button size="small" icon variant="ghost" aria-label="Next match" disabled={!matches.length} onclick={() => find(1)}
      ><ChevronDown size={16} /></Button
    >
  {/if}
</div>
<div
  class="max-h-[min(70vh,800px)] overflow-auto bg-surface outline-offset-2"
  bind:this={viewport}
  bind:clientHeight={height}
  onscroll={() => (scrollTop = viewport?.scrollTop ?? 0)}
  tabindex="0"
  role="textbox"
  aria-readonly="true"
  aria-multiline="true"
  aria-label={`Source for ${path}`}
>
  <div class="w-max min-w-full" style:height={`${lines.length * rowHeight}px`}>
    <div style:padding-top={`${start * rowHeight}px`}>
      {#each lines.slice(start, end) as line, offset (start + offset)}
        {@const number = start + offset + 1}
        {@const isSelected = selected && number >= selected[0] && number <= selected[1]}
        <div class={['flex h-6 font-mono text-[13px] leading-6', isSelected && 'bg-brand-soft']}>
          <a
            href="#L{number}"
            onclick={(event) => choose(event, number)}
            aria-label={`Line ${number}; shift-click to select a range`}
            class={[
              'sticky left-0 w-15.5 shrink-0 bg-surface-muted pr-3 text-right select-none',
              isSelected ? 'text-brand' : 'text-ink-faint hover:text-ink'
            ]}>{number}</a
          >
          <pre class="m-0 px-3.5 font-[inherit] whitespace-pre"><Tokens tokens={tokens[number - 1]} text={line} /></pre>
        </div>
      {/each}
    </div>
  </div>
</div>
