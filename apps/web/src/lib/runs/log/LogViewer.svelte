<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import type { RunJob } from '@marl/contracts';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import { logPieces } from './ansi';
  import type { JobLog } from './job-log.svelte';
  import { jobSteps, type JobStep } from './job-steps';
  import { LogSearch } from './log-search.svelte';
  import LogStepHeader from './LogStepHeader.svelte';
  import LogToolbar from './LogToolbar.svelte';

  let { log, job, now }: { log: JobLog; job: RunJob; now: number } = $props();

  const headerHeight = 36;
  const lineHeight = 20;
  const blockPadding = 8;
  const overscan = 480;
  const failurePattern = /\b(error|errors|failed|failure|fatal|panic(?:ked)?|exception)\b|✗|✘/i;

  const buffer = $derived(log.buffer);
  const search = $derived(new LogSearch(log.buffer));
  const expanded = new SvelteSet<string>();
  let scroller = $state<HTMLDivElement>();
  let searchInput = $state<HTMLInputElement>();
  let scrollTop = $state(0);
  let scrollLeft = $state(0);
  let viewport = $state(640);
  let width = $state(0);
  let pinnedLine = $state<number | null>(null);
  let following = true;
  let frame = 0;

  const steps = $derived.by(() => {
    void buffer.version;
    return jobSteps(buffer, job);
  });
  const live = $derived(job.state === 'queued' || job.state === 'running');
  const failed = $derived(steps.find((step) => step.state === 'failure'));
  const gutter = $derived(`${String(buffer.count).length + 3}ch`);
  const layout = $derived.by(() => {
    let top = 0;
    const items = steps.map((step) => {
      const lines = expanded.has(step.key) ? step.to - step.from : 0;
      const height = headerHeight + (lines ? lines * lineHeight + blockPadding : 0);
      const item = { step, top, lines, height };
      top += height;
      return item;
    });
    return { items, total: top };
  });
  const expandable = $derived(layout.items.filter((item) => item.step.to > item.step.from));
  const allExpanded = $derived(expandable.length > 0 && expandable.every((item) => expanded.has(item.step.key)));
  const windowed = $derived.by(() => {
    const from = scrollTop - overscan;
    const to = scrollTop + viewport + overscan;
    const headers: typeof layout.items = [];
    const rows: number[] = [];
    for (const item of layout.items) {
      if (item.top + item.height < from) continue;
      if (item.top > to) break;
      headers.push(item);
      const first = Math.max(0, Math.floor((from - item.top - headerHeight) / lineHeight));
      const last = Math.min(item.lines, Math.ceil((to - item.top - headerHeight) / lineHeight));
      for (let offset = first; offset < last; offset++) rows.push(item.step.from + offset);
    }
    return { headers, rows };
  });
  const pinned = $derived(
    layout.items.find((item) => item.lines && item.top < scrollTop && item.top + item.height > scrollTop + headerHeight)
  );

  $effect(() => {
    void buffer.version;
    void search.query;
    untrack(() => {
      if (search.refresh() && search.matches.length) void reveal(search.matches[0].line, false);
    });
  });

  $effect(() => {
    const focus = steps.find((step) => step.state === 'running' || step.state === 'failure');
    if (focus) untrack(() => expanded.add(focus.key));
  });

  $effect(() => {
    void layout.total;
    if (!live || !following || !scroller) return;
    void tick().then(() => scroller && (scroller.scrollTop = scroller.scrollHeight));
  });

  $effect(() => {
    if (log.status !== 'ready') return;
    const target = /^#L(\d+)$/.exec(page.url.hash);
    const line = target ? Number(target[1]) - 1 : null;
    if (line !== null && line !== untrack(() => pinnedLine)) untrack(() => void reveal(line, true));
  });

  function onscroll() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!scroller) return;
      scrollTop = scroller.scrollTop;
      scrollLeft = scroller.scrollLeft;
      following = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
    });
  }

  function measure(node: HTMLDivElement) {
    const observer = new ResizeObserver(() => {
      viewport = node.clientHeight;
      width = node.clientWidth;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }

  function toggle(step: JobStep) {
    if (expanded.has(step.key)) expanded.delete(step.key);
    else expanded.add(step.key);
  }

  function stepOf(line: number) {
    return steps.find((step) => line >= step.from && line < step.to);
  }

  function lineTop(line: number) {
    const item = layout.items.find((candidate) => line >= candidate.step.from && line < candidate.step.to);
    return item ? item.top + headerHeight + (line - item.step.from) * lineHeight : 0;
  }

  async function reveal(line: number, highlight: boolean) {
    const step = stepOf(line);
    if (!step || !scroller) return;
    expanded.add(step.key);
    await tick();
    const item = layout.items.find((candidate) => candidate.step.key === step.key);
    if (!item || !scroller) return;
    if (highlight) pinnedLine = line;
    following = false;
    scroller.scrollTop = item.top + headerHeight + (line - step.from) * lineHeight - viewport / 3;
    scrollTop = scroller.scrollTop;
    scroller.scrollIntoView({ block: 'nearest' });
  }

  function linkLine(line: number) {
    pinnedLine = line;
    replaceState(`${page.url.pathname}${page.url.search}#L${line + 1}`, page.state);
  }

  function stepSearch(direction: 1 | -1) {
    const match = search.step(direction);
    if (match) void reveal(match.line, false);
  }

  function jumpToFailure() {
    if (!failed) return;
    let target = failed.to - 1;
    for (let line = failed.from; line < failed.to; line++) {
      if (failurePattern.test(buffer.line(line))) {
        target = line;
        break;
      }
    }
    void reveal(target, true);
  }

  function toggleAll() {
    if (allExpanded) expanded.clear();
    else for (const item of expandable) expanded.add(item.step.key);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([buffer.lines.join('\n')], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${job.key}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function findShortcut(event: KeyboardEvent) {
    if (event.key !== 'f' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    event.preventDefault();
    searchInput?.focus();
    searchInput?.select();
  }
</script>

<svelte:window onkeydown={findShortcut} />

<section class="min-w-0 overflow-hidden surface" aria-label="Log for {job.name}">
  <div class="border-b border-line-subtle px-2 py-2 sm:px-3">
    <LogToolbar
      {search}
      bind:input={searchInput}
      {allExpanded}
      canJump={Boolean(failed && failed.to > failed.from)}
      onstep={stepSearch}
      onjump={jumpToFailure}
      ontoggle={toggleAll}
      ondownload={download}
    />
  </div>
  {#if log.status === 'unavailable'}
    <p class="flex items-center gap-2 px-4 py-5 text-sm text-danger">
      <CircleAlert size={15} />Stored log output is unavailable. Run metadata and artifacts are unaffected.
    </p>
  {:else if log.status === 'loading' && !buffer.count && !steps.length}
    <p class="flex items-center gap-2 px-4 py-5 text-sm text-ink-muted"><Spinner />Loading log</p>
  {:else if !steps.length}
    <p class="px-4 py-5 text-sm text-ink-muted">
      {live ? 'Waiting for a matching runner.' : 'This job produced no log output.'}
    </p>
  {:else}
    <div
      bind:this={scroller}
      {@attach measure}
      {onscroll}
      class="relative max-h-[min(74vh,900px)] overflow-auto overscroll-contain font-mono text-xs"
    >
      <div
        class="relative"
        style:height="{layout.total}px"
        style:width="max(100%, calc({gutter} + {buffer.widest}ch + 32px))"
        style:--log-width="{width}px"
      >
        {#each windowed.headers as item (item.step.key)}
          <LogStepHeader
            step={item.step}
            {now}
            open={item.lines > 0}
            top={item.top}
            offset={scrollLeft}
            ontoggle={() => toggle(item.step)}
          />
        {/each}
        {#each windowed.rows as line (line)}
          <div
            class={[
              'absolute right-0 left-0 flex h-5 items-center leading-5 whitespace-pre',
              line === pinnedLine ? 'bg-brand-soft' : 'hover:bg-surface-hover'
            ]}
            style:top="{lineTop(line)}px"
            style:padding-left={gutter}
          >
            <a
              href="#L{line + 1}"
              class={[
                'absolute top-0 left-0 h-5 pr-3 text-right text-ink-faint tabular-nums select-none hover:text-brand',
                line === pinnedLine ? 'bg-brand-soft' : 'bg-surface'
              ]}
              style:width={gutter}
              style:transform="translateX({scrollLeft}px)"
              onclick={(event) => {
                event.preventDefault();
                linkLine(line);
              }}>{line + 1}</a
            ><span class="text-ink"
              >{#each logPieces(buffer.line(line), search.rangesOn(line), search.currentOn(line)) as piece}<span
                  style={piece.style || undefined}
                  class={piece.match === 'current'
                    ? 'rounded-xs bg-brand text-on-brand'
                    : piece.match === 'match'
                      ? 'rounded-xs bg-warning-soft text-ink-strong'
                      : undefined}>{piece.text}</span
                >{/each}</span
            >
          </div>
        {/each}
        {#if pinned}
          <LogStepHeader
            step={pinned.step}
            {now}
            open
            pinned
            top={scrollTop}
            offset={scrollLeft}
            ontoggle={() => toggle(pinned.step)}
          />
        {/if}
      </div>
    </div>
  {/if}
</section>
