<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  let historyOpen = $state(false);
</script>

<figure class="review">
  <header><h3>Make interrupted pushes recoverable</h3><span><MessageSquare size={14} />1 open conversation</span></header>
  <section class="revision" aria-label="Current revision example">
    <div class="revision-heading"><strong>Revision 3</strong><span>Current</span><code>c47b812</code></div>
    <p class="commit">Recover a published push after a lost response</p>
    <div class="thread">
      <div class="file"><code>publication.rs</code><span>42–43</span></div>
      <div class="code" aria-label="Code excerpt"><code><span>42</span>let published = store.publish(&amp;pack).await?;</code><code><span>43</span>receipt.confirm(published.generation());</code></div>
      <div class="comment"><strong>Noora</strong><p>What happens if the connection drops after publication?</p></div>
      <div class="comment"><strong>Sami</strong><p>The retry finds the same receipt. We return the published generation without writing it twice.</p></div>
    </div>
  </section>
  <button class="history" aria-expanded={historyOpen} aria-controls="example-revision" onclick={() => (historyOpen = !historyOpen)}><ChevronDown size={15} class={historyOpen ? 'expanded' : ''} /><strong>Revision 2</strong><span>4 comments · Changes requested</span></button>
  {#if historyOpen}<div class="previous" id="example-revision"><strong>Noora</strong><p>The recovery path needs a stable receipt. Otherwise a retry can publish the same push twice.</p><p class="response">Sami added receipt lookup in revision 3.</p></div>{/if}
  <figcaption>An example review in Marl. Open revision 2 to follow the earlier discussion.</figcaption>
</figure>

<style>
  .review{min-width:0;margin:0;padding:22px;border-radius:16px;background:var(--surface);box-shadow:var(--shadow-surface)}
  header{margin-bottom:22px}h3{margin:0;color:var(--text-strong);font-size:19px;font-weight:650;letter-spacing:-.025em;line-height:1.3}
  header>span{display:flex;align-items:center;gap:7px;margin-top:12px;color:var(--text-muted);font-size:12px}
  .revision{padding:12px;border-radius:12px;background:var(--surface-muted)}
  .revision-heading{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12px}.revision-heading strong{color:var(--text-strong)}.revision-heading span{color:var(--text-muted)}.revision-heading code{margin-left:auto;color:var(--text-faint);font:11px var(--font-mono)}
  .commit{margin:7px 0 14px;color:var(--text-muted);font-size:12px}
  .thread{overflow:hidden;border-radius:8px;background:var(--surface)}
  .file{display:flex;gap:10px;padding:12px 14px;font-size:11px;color:var(--text-muted)}.file code{font-family:var(--font-mono)}
  .code{overflow-x:auto;padding:8px 0;background:var(--success-soft)}.code code{display:block;width:max-content;min-width:100%;padding:2px 14px;color:var(--text);font:11px/1.6 var(--font-mono);white-space:pre}.code span{display:inline-block;width:28px;color:var(--text-faint);user-select:none}
  .comment{padding:14px}.comment+.comment{padding-top:0}.comment strong,.previous strong{color:var(--text-strong);font-size:12px}.comment p,.previous p{margin:6px 0 0;font-size:13px;line-height:1.6}
  .history{display:flex;width:100%;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;padding:14px 10px;border:0;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;text-align:left;font-size:12px}.history:hover{background:var(--surface-hover)}.history strong{color:var(--text)}.history span{margin-left:auto;font-size:11px}.history :global(svg){transform:rotate(-90deg)}.history :global(svg.expanded){transform:none}
  .previous{margin-top:6px;padding:14px;border-radius:8px;background:var(--surface-muted)}.previous .response{color:var(--text-muted)}
  figcaption{margin-top:14px;color:var(--text-faint);font-size:11px;line-height:1.5}
  @media(max-width:560px){.review{padding:16px}.revision{padding:10px}.history span{margin-left:23px}h3{font-size:18px}}
</style>
