<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Tokens from './Tokens.svelte';
  import { codeLanguage, highlight } from './highlight';
  import type { CodeLines } from './types';

  let { content, path } = $props<{ content: string; path: string }>();
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
  const matches = $derived(query ? lines.flatMap((line: string, index: number) => line.toLowerCase().includes(query.toLowerCase()) ? [index] : []) : []);

  $effect(() => {
    const abort = new AbortController();
    tokens = [];
    void highlight(content, codeLanguage(path), abort.signal).then(result => { if (!abort.signal.aborted) tokens = result; });
    return () => abort.abort();
  });
  function jump(line: number) { if (viewport) viewport.scrollTop = Math.max(0, (line - 1) * rowHeight - rowHeight * 3); }
  function find(direction: number) {
    if (!matches.length) return;
    match = (match + direction + matches.length) % matches.length;
    selected = [matches[match] + 1, matches[match] + 1]; jump(matches[match] + 1);
  }
  function choose(event: MouseEvent, line: number) {
    event.preventDefault();
    selected = event.shiftKey && selected ? [Math.min(selected[0], line), Math.max(selected[0], line)] : [line, line];
    history.replaceState(history.state, '', `#L${selected[0]}${selected[1] !== selected[0] ? `-L${selected[1]}` : ''}`);
  }
  onMount(() => {
    const readHash = () => {
      const found = /^#L(\d+)(?:-L?(\d+))?$/.exec(location.hash);
      if (found) { selected = [Number(found[1]), Number(found[2] ?? found[1])]; jump(selected[0]); }
    };
    readHash(); window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  });
</script>
<div class="find"><input aria-label="Find in file" placeholder="Find in file" bind:value={query} oninput={() => { match = -1; }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); find(event.shiftKey ? -1 : 1); } }} />{#if query}<span>{matches.length} matching lines</span><Button size="small" disabled={!matches.length} onclick={() => find(-1)}>Previous</Button><Button size="small" disabled={!matches.length} onclick={() => find(1)}>Next</Button>{/if}</div>
<div class="viewport" bind:this={viewport} bind:clientHeight={height} onscroll={() => scrollTop = viewport?.scrollTop ?? 0} tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label={`Source for ${path}`}>
  <div class="lines" style:height={`${lines.length * rowHeight}px`}>
    <div style:padding-top={`${start * rowHeight}px`}>
      {#each lines.slice(start, end) as line, offset (start + offset)}
        {@const number = start + offset + 1}
        <div class="line" class:selected={selected && number >= selected[0] && number <= selected[1]}><a href="#L{number}" onclick={event => choose(event, number)} aria-label={`Line ${number}; shift-click to select a range`}>{number}</a><pre><Tokens tokens={tokens[number - 1]} text={line} /></pre></div>
      {/each}
    </div>
  </div>
</div>
<style>
  .find{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border-subtle);font-size:12px}.find input{min-width:100px;flex:1;border:0;outline:0;background:transparent;color:var(--text);font:inherit}.find span{color:var(--text-muted)}.viewport{height:min(70vh,800px);min-height:240px;overflow:auto;outline-offset:2px;background:var(--surface)}.lines{min-width:100%;width:max-content}.line{display:flex;height:24px;font:13px/24px var(--font-mono)}.line a{position:sticky;left:0;flex:none;width:62px;padding-right:12px;background:var(--surface-muted);color:var(--text-faint);text-align:right;text-decoration:none;user-select:none}.line pre{margin:0;padding:0 14px;font:inherit;white-space:pre}.line.selected{background:var(--brand-soft)}.line.selected a{color:var(--brand)}
</style>
