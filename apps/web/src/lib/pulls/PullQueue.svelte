<script lang="ts">
  import type { PullRequestSummary } from '@marl/contracts';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitPullRequestClosed from 'lucide-svelte/icons/git-pull-request-closed';
  import Time from '$lib/components/Time.svelte';
  import { pullSignal, type PullQueueGroup } from './pull-signal';

  let {
    pulls,
    showRepository = false,
    grouped = false,
    emptyTitle,
    emptyDescription,
    createHref
  } = $props<{
    pulls: PullRequestSummary[];
    showRepository?: boolean;
    grouped?: boolean;
    emptyTitle: string;
    emptyDescription: string;
    createHref?: string;
  }>();

  const sections = $derived.by(() => {
    if (!grouped) return [{ key: 'complete' as PullQueueGroup, title: '', pulls }];
    const definitions: Array<{ key: PullQueueGroup; title: string }> = [
      { key: 'ready', title: 'Ready to land' },
      { key: 'attention', title: 'Needs attention' },
      { key: 'review', title: 'In review' },
      { key: 'draft', title: 'Still taking shape' }
    ];
    return definitions
      .map((section) => ({ ...section, pulls: pulls.filter((pull: PullRequestSummary) => pullSignal(pull).group === section.key) }))
      .filter((section) => section.pulls.length > 0);
  });

  function href(pull: PullRequestSummary) {
    return `/${pull.repository.owner}/${pull.repository.name}/pulls/${pull.number}`;
  }
</script>

{#if pulls.length}
  <div class="queue">
    {#each sections as section (section.key)}
      <section class="queue-section">
        {#if section.title}
          <header class="section-heading">
            <h2>{section.title}</h2>
            <span>{section.pulls.length}</span>
          </header>
        {/if}
        <div class="rows">
          {#each section.pulls as pull (pull.id)}
            {@const signal = pullSignal(pull)}
            <article class="pull-row {signal.tone}">
              <span class="state-icon">
                {#if pull.state === 'merged'}<GitMerge size={17} />
                {:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />
                {:else}<GitPullRequest size={17} />{/if}
              </span>
              <div class="pull-copy">
                <div class="title-line">
                  <a href={href(pull)} title={pull.title}>{pull.title}</a>
                  {#if pull.labels.length}
                    <span class="labels">
                      {#each pull.labels.slice(0, 3) as label (label.id)}<span style:--label-color={label.color}><i></i>{label.name}</span>{/each}
                    </span>
                  {/if}
                </div>
                <p>
                  {#if showRepository}<a class="repository" href="/{pull.repository.owner}/{pull.repository.name}">{pull.repository.owner}/{pull.repository.name}</a><span>·</span>{/if}
                  <span>!{pull.number}</span><span>by</span><a class="author" href="/{pull.author}">{pull.authorDisplayName}</a><span>·</span><Time value={pull.updatedAt} />
                </p>
                <div class="revision">
                  <code>{pull.sourceRepository && `${pull.sourceRepository.owner}/${pull.sourceRepository.name}` !== `${pull.repository.owner}/${pull.repository.name}` ? `${pull.sourceRepository.owner}:` : ''}{pull.sourceBranch}</code>
                  <ArrowRight size={11} />
                  <code>{pull.targetBranch}</code>
                  {#if pull.checkSummary.total}<span class:failed={pull.checkSummary.failed > 0} class:running={pull.checkSummary.running > 0}>
                    {#if pull.checkSummary.failed}<CircleAlert size={12} />{pull.checkSummary.failed} failed
                    {:else if pull.checkSummary.running}<CircleDot size={12} />{pull.checkSummary.running} running
                    {:else if pull.checkSummary.total}<CircleCheck size={12} />{pull.checkSummary.passed}/{pull.checkSummary.total} passed
                    {/if}
                  </span>{/if}
                </div>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <div class="empty"><GitPullRequest size={24} /><strong>{emptyTitle}</strong><p>{emptyDescription}</p>{#if createHref}<a href={createHref}>Open a pull</a>{/if}</div>
{/if}

<style>
  .queue{display:grid;gap:24px}.queue-section{min-width:0}.section-heading{display:flex;align-items:center;gap:10px;margin:0 10px 8px}.section-heading h2{margin:0;color:var(--text-strong);font-size:13px;font-weight:660;letter-spacing:-.01em}.section-heading>span{color:var(--text-faint);font-size:11px;font-variant-numeric:tabular-nums}.rows{display:grid}.pull-row{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:13px;min-height:80px;padding:10px;border-radius:9px;transition:background-color 140ms ease,transform 140ms ease}.pull-row:hover{background:var(--surface-hover)}.pull-row:active{transform:translateY(1px)}.state-icon{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:var(--brand-soft);color:var(--brand)}.pull-row.attention .state-icon{background:var(--danger-soft);color:var(--danger)}.pull-row.ready .state-icon,.pull-row.complete .state-icon{background:var(--success-soft);color:var(--success)}.pull-row.quiet .state-icon{background:var(--surface-muted);color:var(--text-faint)}.pull-copy{min-width:0}.title-line{display:flex;min-width:0;align-items:center;gap:9px}.title-line>a{min-width:0;overflow:hidden;color:var(--text-strong);font-size:13px;font-weight:650;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.title-line>a::after{position:absolute;inset:0;content:''}.labels{position:relative;z-index:1;display:flex;min-width:0;gap:8px;overflow:hidden}.labels>span{display:inline-flex;flex:none;align-items:center;gap:4px;color:var(--text-muted);font-size:10px}.labels i{width:5px;height:5px;border-radius:50%;background:var(--label-color)}.pull-copy>p{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:5px 0 0;color:var(--text-muted);font-size:11px}.pull-copy>p a{position:relative;z-index:1;color:var(--text-muted);text-decoration:none}.pull-copy>p a:hover{color:var(--brand)}.revision{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;color:var(--text-faint);font-size:11px}.revision code{overflow:hidden;max-width:170px;color:var(--text-muted);text-overflow:ellipsis;white-space:nowrap}.revision>span{display:inline-flex;align-items:center;gap:4px;margin-left:7px;color:var(--success)}.revision>span.failed{color:var(--danger)}.revision>span.running{color:var(--warning)}.empty{padding:72px 20px;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:11px;color:var(--text-strong);font-size:15px}.empty p{max-width:420px;margin:6px auto 0;font-size:11px}.empty a{position:relative;display:inline-flex;margin-top:15px;color:var(--brand-strong);font-size:11px;text-decoration:none}
  @media(max-width:720px){.queue{gap:24px}.pull-row{grid-template-columns:32px minmax(0,1fr);padding-inline:5px}.labels{display:none}.section-heading{margin-inline:5px}}
</style>
