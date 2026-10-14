<script lang="ts">
  import type { ReviewThread } from '@marl/contracts';
  import type { ReviewThreadState } from '#lib/pulls/review/ReviewThreadState.svelte.js';
  import type { Discussion } from './discussion.svelte';

  let { discussion, thread, state }: { discussion: Discussion; thread: ReviewThread; state: ReviewThreadState } =
    $props();

  async function load() {
    if (state.codeLines.length || state.contextLoading) return;
    state.contextLoading = true;
    try {
      state.codeLines = await discussion.pageState.loadThreadContext(thread);
    } catch {
      state.codeLines = [];
    } finally {
      state.contextLoading = false;
    }
  }

  function nearViewport(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

<div
  {@attach nearViewport}
  class="mx-3 overflow-x-auto rounded-lg bg-surface-muted py-1.5 font-mono text-xs leading-6"
  class:min-h-18={!state.codeLines.length}
>
  {#each state.codeLines as line (line.key)}
    {#if line.kind === 'omitted'}<div class="px-3 text-ink-faint">⋯</div>{:else}<div
        class={[
          'grid w-max min-w-full grid-cols-[2.75rem_auto]',
          line.selected && (line.kind === 'removed' ? 'bg-danger-soft' : 'bg-brand-soft')
        ]}
      >
        <span class={['pr-3 text-right select-none', line.selected ? 'text-ink' : 'text-ink-faint']}>{line.line}</span>
        <pre
          class={[
            'm-0 pr-4 font-[inherit] whitespace-pre',
            line.selected ? 'text-ink-strong' : 'text-ink-muted'
          ]}>{line.text || ' '}</pre>
      </div>{/if}
  {/each}
</div>
