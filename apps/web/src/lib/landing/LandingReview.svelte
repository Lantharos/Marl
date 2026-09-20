<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { keyboardScroll } from '$lib/actions/keyboard-scroll';

  type ReviewComment = { author: string; initials: string; body: string };
  type ReviewThread = { line: number; lines: string[]; comments: ReviewComment[] };
  type ExampleRevision = { number: number; title: string; outcome: string; summary: string; approved?: boolean; threads: ReviewThread[] };

  let openRevision = $state<number | null>(null);
  const current: ExampleRevision = {
    number: 3,
    title: 'Include filters without changing browser history',
    outcome: 'Approved',
    summary: 'The query and filters are included. This is ready to merge.',
    approved: true,
    threads: [{
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
    }]
  };
  const history: ExampleRevision[] = [
    {
      number: 2, title: 'Copy the search query into the URL', outcome: 'Changes requested',
      summary: 'Two things before we merge: include the filters and keep the current page unchanged.',
      threads: [{ line: 18, lines: [
        "const url = new URL('/search', location.origin);",
        "url.searchParams.set('q', query);"
      ],
      comments: [
        { author: 'Noora', initials: 'N', body: 'The query is there, but the language filter is missing. A shared link should open the same results.' },
        { author: 'Sami', initials: 'S', body: 'Good catch. I’ll include the active filters alongside the query.' }
      ] }, { line: 20, lines: ['history.replaceState(null, \'\', url);'], comments: [
        { author: 'Noora', initials: 'N', body: 'Could we just copy the URL? Sharing shouldn’t change the page I’m on.' }
      ] }]
    },
    {
      number: 1, title: 'Add a copy-link action to search', outcome: 'Reviewed',
      summary: 'Nice start. The link needs to carry the search itself.',
      threads: [{ line: 18, lines: ['await navigator.clipboard.writeText(location.href);'],
      comments: [
        { author: 'Noora', initials: 'N', body: 'This copies the page address, but the search is still only in local state. Could the link carry the query?' },
        { author: 'Sami', initials: 'S', body: 'That makes sense. I’ll build the URL from the current search.' }
      ] }]
    }
  ];
</script>

{#snippet thread(discussion: ReviewThread, revision: number)}
  <div class="thread">
    <div class="file"><code>search.ts</code><span>{discussion.line}{discussion.lines.length > 1 ? '–' + (discussion.line + discussion.lines.length - 1) : ''}</span></div>
    <div class="code" role="region" aria-label={'Revision ' + revision + ', code at line ' + discussion.line} {@attach keyboardScroll}>
      {#each discussion.lines as line, index (line)}
        <code><span>{discussion.line + index}</span>{line}</code>
      {/each}
    </div>
    <div class="discussion">
      {#each discussion.comments as comment (comment.author)}
        <div class="comment">
          <span class="avatar" class:author={comment.initials === 'S'} aria-hidden="true">{comment.initials}</span>
          <div><div class="comment-heading"><strong>{comment.author}</strong></div><p>{comment.body}</p></div>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet review(revision: ExampleRevision)}
  <div class="review-group">
    <div class="review-summary">
      <span class="avatar" aria-hidden="true">N</span>
      <div>
        <div class="comment-heading"><strong>Noora</strong><span class:approved={revision.approved}>{revision.outcome === 'Changes requested' ? 'requested changes' : revision.approved ? 'approved this revision' : 'reviewed'}</span></div>
        <p>{revision.summary}</p>
      </div>
    </div>
    <div class="review-threads">
      {#each revision.threads as discussion (discussion.line)}
        {@render thread(discussion, revision.number)}
      {/each}
    </div>
  </div>
{/snippet}

<figure class="review" aria-label="Interactive pull preview">
  <header>
    <h3>Make search URLs shareable</h3>
  </header>
  <div class="revisions">
    <section class="revision current" aria-label="Revision 3, current">
      <div class="revision-heading"><strong>Revision 3</strong><span>Current</span></div>
      {@render review(current)}
    </section>
    {#each history as revision (revision.number)}
      <section class="revision" class:expanded={openRevision === revision.number}>
        <button
          type="button"
          class="history"
          aria-expanded={openRevision === revision.number}
          aria-controls={'example-revision-' + revision.number}
          onclick={() => (openRevision = openRevision === revision.number ? null : revision.number)}
        >
          <span class="history-copy">
            <span class="revision-heading"><strong>Revision {revision.number}</strong></span>
            <span class="revision-title">{revision.title}</span>
            <span class="history-meta">{revision.outcome}</span>
          </span>
          <ChevronDown size={18} />
        </button>
        <div id={'example-revision-' + revision.number} hidden={openRevision !== revision.number}>
          {#if openRevision === revision.number}{@render review(revision)}{/if}
        </div>
      </section>
    {/each}
  </div>
</figure>

<style>
  .review{width:min(960px,100%);min-width:0;margin:0 auto}
  header{padding:0 0 24px}
  h3{margin:0;color:var(--text-strong);font-size:24px;font-weight:600;letter-spacing:-.03em;line-height:1.25;text-wrap:balance}
  .revisions{display:grid;min-width:0;gap:8px}
  .revision{min-width:0;overflow:hidden;border-radius:16px;background:var(--surface-muted)}
  .current,.expanded{padding:0 6px 6px}
  .current>.revision-heading{padding:18px 14px}
  .revision-heading{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:12px}
  .revision-heading strong{color:var(--text-strong);font-size:14px;font-weight:600}
  .revision-heading span{color:var(--text-muted)}
  .revision-title{display:block;margin:6px 0 0;color:var(--text);font-size:13px;line-height:1.5}
  .review-group{min-width:0;border-radius:10px;background:var(--surface)}
  .review-summary{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;padding:20px}
  .review-summary p{margin:6px 0 0;font-size:14px;line-height:1.65;text-wrap:pretty}
  .review-summary .comment-heading span{color:var(--text-muted);font-size:12px}
  .review-summary .comment-heading .approved{color:var(--success)}
  .review-threads{display:grid;gap:8px;padding:0 8px 8px}
  .thread{min-width:0;overflow:hidden;border-radius:6px;background:var(--surface-muted)}
  .file{display:flex;align-items:center;gap:12px;padding:14px 16px;font-size:12px;color:var(--text-muted)}.file code{font-family:var(--font-mono)}
  .code{overflow-x:auto;padding:8px 0;background:var(--success-soft)}
  .code:focus-visible{outline-offset:-2px}
  .code code{display:block;width:max-content;min-width:100%;padding:2px 16px;color:var(--text);font:13px/1.7 var(--font-mono);white-space:pre}
  .code span{display:inline-block;width:30px;color:var(--text-faint);user-select:none}
  .discussion{display:grid;gap:24px;padding:20px 16px}
  .comment{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:start;gap:10px}
  .avatar{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;background:var(--brand-soft);color:var(--brand-strong);font-size:12px;font-weight:600}
  .avatar.author{background:var(--surface-muted);color:var(--text)}
  .comment-heading{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-height:28px}
  .comment-heading strong{color:var(--text-strong);font-size:13px;font-weight:600}
  .comment p{max-width:60ch;margin:4px 0 0;font-size:14px;line-height:1.65;text-wrap:pretty}
  .history{display:flex;width:100%;align-items:center;justify-content:space-between;gap:20px;padding:18px 20px;border:0;border-radius:16px;background:transparent;color:var(--text-muted);cursor:pointer;text-align:left}
  .history:hover{background:var(--surface-hover)}
  .history:focus-visible{outline-offset:-3px}
  .history-copy{min-width:0;flex:1}.history .revision-heading{justify-content:flex-start}
  .history-meta{display:block;margin-top:6px;color:var(--text-muted);font-size:12px}
  .history :global(svg){flex:none;transition:transform 160ms ease}
  .expanded .history{width:calc(100% + 12px);margin:0 -6px}
  .expanded .history :global(svg){transform:rotate(180deg)}

  @media(max-width:560px){
    header{padding:0 0 20px}h3{font-size:20px}
    .current>.revision-heading{padding:16px 10px}
    .review-summary{padding:16px 12px;gap:8px;grid-template-columns:24px minmax(0,1fr)}
    .revision-heading{gap:8px}.file{padding:12px}.code code{padding:2px 12px}
    .discussion{padding:16px 12px;gap:20px}.comment{grid-template-columns:24px minmax(0,1fr);gap:8px}.avatar{width:24px;height:24px;font-size:11px}
    .comment-heading{min-height:24px}.comment p,.review-summary p{font-size:13px}
    .history{padding:16px;gap:12px}.history-meta{font-size:11px}
  }
  @media(prefers-reduced-motion:reduce){.history :global(svg){transition:none}}
</style>
