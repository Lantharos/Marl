<script lang="ts">
  import type { IssueSummary } from '@marl/contracts';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import CircleDotDashed from 'lucide-svelte/icons/circle-dot-dashed';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Time from '$lib/components/Time.svelte';
  import { issueSignal, type IssueQueueGroup } from './issue-signal';

  let {
    issues,
    showRepository = false,
    grouped = false,
    emptyTitle,
    emptyDescription
  } = $props<{
    issues: IssueSummary[];
    showRepository?: boolean;
    grouped?: boolean;
    emptyTitle: string;
    emptyDescription: string;
  }>();

  const sections = $derived.by(() => {
    if (!grouped) return [{ key: 'complete' as IssueQueueGroup, title: '', issues }];
    const definitions: Array<{ key: IssueQueueGroup; title: string }> = [
      { key: 'motion', title: 'In motion' },
      { key: 'decision', title: 'Needs a decision' },
      { key: 'unclaimed', title: 'Needs an owner' }
    ];
    return definitions
      .map((section) => ({ ...section, issues: issues.filter((issue: IssueSummary) => issueSignal(issue).group === section.key) }))
      .filter((section) => section.issues.length > 0);
  });

  function assigneeNames(issue: IssueSummary) {
    return issue.assignees.map((person) => person.displayName || `@${person.handle}`).join(', ');
  }
</script>

{#if issues.length}
  <div class="queue">
    {#each sections as section (section.key)}
      <section class="queue-section">
        {#if section.title}
          <header class="section-heading"><h2>{section.title}</h2><span>{section.issues.length}</span></header>
        {/if}
        <div class="rows">
          {#each section.issues as issue (issue.id)}
            {@const signal = issueSignal(issue)}
            <article class="issue-row {signal.tone}">
              <span class="state-icon">{#if issue.state === 'closed'}<CircleDotDashed size={17} />{:else}<CircleDot size={17} />{/if}</span>
              <div class="issue-copy">
                <div class="title-line">
                  <a href="/{issue.repository.owner}/{issue.repository.name}/issues/{issue.number}">{issue.title}</a>
                  {#if issue.labels.length}<span class="labels">{#each issue.labels.slice(0, 4) as label (label.id)}<span style:--label-color={label.color}><i></i>{label.name}</span>{/each}</span>{/if}
                </div>
                <p>{#if showRepository}<a class="repository" href="/{issue.repository.owner}/{issue.repository.name}">{issue.repository.owner}/{issue.repository.name}</a><span>·</span>{/if}<span>#{issue.number}</span><span>by</span><a class="author" href="/{issue.author}">{issue.authorDisplayName}</a>{#if issue.assignees.length}<span>·</span><span>owned by {assigneeNames(issue)}</span>{/if}<span>·</span><Time value={issue.updatedAt} /></p>
                {#if issue.commentCount}<span class="comments"><MessageSquare size={11} />{issue.commentCount} {issue.commentCount === 1 ? 'reply' : 'replies'}</span>{/if}
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <div class="empty"><CircleDot size={23} /><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>
{/if}

<style>
  .queue{display:grid;gap:30px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 10px 8px}.section-heading h2{margin:0;color:var(--text-strong);font-size:13px;font-weight:660;letter-spacing:-.01em}.section-heading>span{color:var(--text-faint);font-size:10px;font-variant-numeric:tabular-nums}.rows{display:grid}.issue-row{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:13px;min-height:76px;padding:9px 10px;border-radius:9px;transition:background-color 140ms ease,transform 140ms ease}.issue-row:hover{background:var(--surface-hover)}.issue-row:active{transform:translateY(1px)}.state-icon{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:var(--success-soft);color:var(--success)}.issue-row.attention .state-icon{background:var(--danger-soft);color:var(--danger)}.issue-row.quiet .state-icon{background:var(--surface-muted);color:var(--text-faint)}.issue-copy{min-width:0}.title-line{display:flex;min-width:0;align-items:center;gap:9px}.title-line>a{min-width:0;overflow:hidden;color:var(--text-strong);font-size:12px;font-weight:650;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.title-line>a::after{position:absolute;inset:0;content:''}.labels{position:relative;z-index:1;display:flex;min-width:0;gap:8px;overflow:hidden}.labels>span{display:inline-flex;flex:none;align-items:center;gap:4px;color:var(--text-muted);font-size:8px}.labels i{width:5px;height:5px;border-radius:50%;background:var(--label-color)}.issue-copy>p{display:flex;align-items:center;gap:4px;margin:4px 0 0;overflow:hidden;color:var(--text-faint);font-size:9px;white-space:nowrap}.issue-copy>p a{position:relative;z-index:1;color:var(--text-muted);text-decoration:none}.issue-copy>p a:hover{color:var(--brand)}.comments{display:inline-flex;align-items:center;gap:4px;margin-top:6px;color:var(--text-faint);font-size:8px}.empty{padding:52px 20px;color:var(--text-faint);text-align:center}.empty strong{display:block;margin-top:10px;color:var(--text-strong);font-size:13px}.empty p{margin:5px 0 0;font-size:10px}
  @media(max-width:720px){.queue{gap:24px}.issue-row{grid-template-columns:32px minmax(0,1fr);padding-inline:5px}.labels{display:none}.section-heading{margin-inline:5px}}
</style>
