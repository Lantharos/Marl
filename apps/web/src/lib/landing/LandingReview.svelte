<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { keyboardScroll } from '$lib/actions/keyboard-scroll';

  type ReviewComment = { author: string; initials: string; body: string };
  type ReviewThread = { line: number; lines: string[]; comments: ReviewComment[] };
  type ExampleRevision = {
    number: number;
    title: string;
    outcome: string;
    summary: string;
    approved?: boolean;
    threads: ReviewThread[];
  };

  let openRevision = $state<number | null>(null);
  const current: ExampleRevision = {
    number: 3,
    title: 'Include filters without changing browser history',
    outcome: 'Approved',
    summary: 'The query and filters are included. This is ready to merge.',
    approved: true,
    threads: [
      {
        line: 18,
        lines: [
          "const url = new URL('/search', location.origin);",
          'const params = new URLSearchParams({ q: query, ...filters });',
          'url.search = params.toString();',
          'await navigator.clipboard.writeText(url.href);'
        ],
        comments: [
          { author: 'Noora', initials: 'N', body: 'Does sharing a search affect the Back button?' },
          { author: 'Sami', initials: 'S', body: 'No, it only copies the URL. Your history stays as it is.' }
        ]
      }
    ]
  };
  const history: ExampleRevision[] = [
    {
      number: 2,
      title: 'Copy the search query into the URL',
      outcome: 'Changes requested',
      summary: 'Two things before we merge: include the filters and keep the current page unchanged.',
      threads: [
        {
          line: 18,
          lines: ["const url = new URL('/search', location.origin);", "url.searchParams.set('q', query);"],
          comments: [
            {
              author: 'Noora',
              initials: 'N',
              body: 'The query is there, but the language filter is missing. A shared link should open the same results.'
            },
            { author: 'Sami', initials: 'S', body: 'Good catch. I’ll include the active filters alongside the query.' }
          ]
        },
        {
          line: 20,
          lines: ["history.replaceState(null, '', url);"],
          comments: [
            {
              author: 'Noora',
              initials: 'N',
              body: 'Could we just copy the URL? Sharing shouldn’t change the page I’m on.'
            }
          ]
        }
      ]
    },
    {
      number: 1,
      title: 'Add a copy-link action to search',
      outcome: 'Reviewed',
      summary: 'Nice start. The link needs to carry the search itself.',
      threads: [
        {
          line: 18,
          lines: ['await navigator.clipboard.writeText(location.href);'],
          comments: [
            {
              author: 'Noora',
              initials: 'N',
              body: 'This copies the page address, but the search is still only in local state. Could the link carry the query?'
            },
            { author: 'Sami', initials: 'S', body: 'That makes sense. I’ll build the URL from the current search.' }
          ]
        }
      ]
    }
  ];
</script>

{#snippet avatar(initials: string, author = false)}
  <span
    class={[
      'grid size-7 place-items-center rounded-full text-xs font-semibold',
      author ? 'bg-surface-muted text-ink' : 'bg-brand-soft text-brand-strong'
    ]}
    aria-hidden="true">{initials}</span
  >
{/snippet}

{#snippet thread(discussion: ReviewThread, revision: number)}
  <div class="min-w-0 overflow-hidden rounded-md bg-surface-muted">
    <div class="flex items-center gap-3 px-4 py-3.5 text-xs text-ink-muted">
      <code class="font-mono">search.ts</code><span
        >{discussion.line}{discussion.lines.length > 1
          ? '–' + (discussion.line + discussion.lines.length - 1)
          : ''}</span
      >
    </div>
    <div
      class="overflow-x-auto bg-success-soft py-2 focus-visible:outline-offset-[-2px]"
      role="region"
      aria-label={'Revision ' + revision + ', code at line ' + discussion.line}
      {@attach keyboardScroll}
    >
      {#each discussion.lines as line, index (line)}
        <code class="block w-max min-w-full px-4 py-0.5 font-mono text-[13px] leading-[1.7] whitespace-pre text-ink"
          ><span class="inline-block w-7.5 text-ink-faint select-none">{discussion.line + index}</span>{line}</code
        >
      {/each}
    </div>
    <div class="grid gap-6 px-4 py-5">
      {#each discussion.comments as comment (comment.author)}
        <div class="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-2.5">
          {@render avatar(comment.initials, comment.initials === 'S')}
          <div>
            <div class="flex min-h-7 items-center">
              <strong class="text-sm font-semibold text-ink-strong">{comment.author}</strong>
            </div>
            <p class="mt-1 max-w-[60ch] text-base leading-relaxed text-pretty">{comment.body}</p>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet review(revision: ExampleRevision)}
  <div class="min-w-0 rounded-lg bg-surface">
    <div class="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 p-5 max-sm:p-4">
      {@render avatar('N')}
      <div>
        <div class="flex min-h-7 flex-wrap items-center gap-2.5">
          <strong class="text-sm font-semibold text-ink-strong">Noora</strong><span
            class={['text-xs', revision.approved ? 'text-success' : 'text-ink-muted']}
            >{revision.outcome === 'Changes requested'
              ? 'requested changes'
              : revision.approved
                ? 'approved this revision'
                : 'reviewed'}</span
          >
        </div>
        <p class="mt-1.5 text-base leading-relaxed text-pretty">{revision.summary}</p>
      </div>
    </div>
    <div class="grid gap-2 px-2 pb-2">
      {#each revision.threads as discussion (discussion.line)}
        {@render thread(discussion, revision.number)}
      {/each}
    </div>
  </div>
{/snippet}

<figure class="mx-auto w-[min(960px,100%)] min-w-0" aria-label="Interactive pull preview">
  <header class="pb-6 max-sm:pb-5">
    <h3 class="text-2xl leading-tight font-semibold tracking-tight text-balance text-ink-strong">
      Make search URLs shareable
    </h3>
  </header>
  <div class="grid min-w-0 gap-2">
    <section
      class="min-w-0 overflow-hidden rounded-2xl bg-surface-muted px-1.5 pb-1.5"
      aria-label="Revision 3, current"
    >
      <div class="flex flex-wrap items-center gap-3 px-3.5 py-4.5 text-xs">
        <strong class="text-base font-semibold text-ink-strong">Revision 3</strong><span class="text-ink-muted"
          >Current</span
        >
      </div>
      {@render review(current)}
    </section>
    {#each history as revision (revision.number)}
      {@const expanded = openRevision === revision.number}
      <section class={['min-w-0 overflow-hidden rounded-2xl bg-surface-muted', expanded && 'px-1.5 pb-1.5']}>
        <button
          type="button"
          class={[
            'flex w-full items-center justify-between gap-5 rounded-2xl px-5 py-4.5 text-left text-ink-muted transition-colors hover:bg-surface-hover focus-visible:outline-offset-[-3px]',
            expanded && '-mx-1.5 w-[calc(100%+12px)]'
          ]}
          aria-expanded={expanded}
          aria-controls={'example-revision-' + revision.number}
          onclick={() => (openRevision = expanded ? null : revision.number)}
        >
          <span class="min-w-0 flex-1">
            <strong class="block text-base font-semibold text-ink-strong">Revision {revision.number}</strong>
            <span class="mt-1.5 block text-sm leading-normal text-ink">{revision.title}</span>
            <span class="mt-1.5 block text-xs text-ink-muted">{revision.outcome}</span>
          </span>
          <ChevronDown size={18} />
        </button>
        <div id={'example-revision-' + revision.number} hidden={!expanded}>
          {#if expanded}{@render review(revision)}{/if}
        </div>
      </section>
    {/each}
  </div>
</figure>
