<script lang="ts">
  import type { IssueSummary } from '@marl/contracts';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import MessageCircle from 'lucide-svelte/icons/message-circle';
  import Time from '$lib/components/Time.svelte';

  let { issues, showRepository = false, emptyTitle, emptyDescription } = $props<{
    issues: IssueSummary[];
    showRepository?: boolean;
    emptyTitle: string;
    emptyDescription: string;
  }>();
</script>

{#if issues.length}
  <div class="issues">
    {#each issues as issue (issue.id)}
      <article class="issue" class:closed={issue.state === 'closed'}>
        <span class="state" title={issue.state === 'closed' ? 'Closed' : 'Open'}>{#if issue.state === 'closed'}<CircleCheck size={19} />{:else}<CircleDot size={19} />{/if}</span>
        <div class="copy">
          <div class="title"><a href="/{issue.repository.owner}/{issue.repository.name}/issues/{issue.number}">{issue.title}</a>{#if issue.unread}<span class="unread" aria-label="Unread replies" title="Unread replies"></span>{/if}</div>
          <div class="meta">
            {#if showRepository}<a href="/{issue.repository.owner}/{issue.repository.name}">{issue.repository.owner}/{issue.repository.name}</a>{/if}
            <span>#{issue.number}</span><span>·</span><a href="/{issue.author}">{issue.authorDisplayName}</a><span>·</span><Time value={issue.updatedAt} />
            {#each issue.labels.slice(0, 2) as label (label.id)}<span class="label" style:--label-color={label.color}><i></i>{label.name}</span>{/each}
          </div>
        </div>
        <span class="replies" aria-label={`${issue.commentCount} replies`}><MessageCircle size={15} /><span>{issue.commentCount}</span></span>
      </article>
    {/each}
  </div>
{:else}
  <div class="empty"><CircleDot size={24} /><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>
{/if}

<style>
  .issues{display:grid;gap:3px}.issue{position:relative;display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:14px;align-items:start;min-height:82px;padding:17px 14px;border-radius:12px;transition:background 120ms ease}.issue:hover,.issue:focus-within{background:var(--surface-hover)}.state{padding-top:2px;color:var(--success)}.closed .state{color:var(--text-muted)}.copy{min-width:0}.title{display:flex;align-items:center;gap:8px}.title>a{display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;color:var(--text-strong);font-size:14px;font-weight:650;line-height:1.5;text-decoration:none}.title>a::after{position:absolute;inset:0;content:''}.unread{flex:none;width:6px;height:6px;border-radius:50%;background:var(--brand)}.meta{display:flex;flex-wrap:wrap;align-items:center;gap:5px 7px;margin-top:6px;color:var(--text-muted);font-size:11px}.meta>a{position:relative;z-index:1;color:inherit;text-decoration:none}.meta>a:hover{color:var(--brand)}.label{display:inline-flex;align-items:center;gap:5px;margin-left:3px;padding:2px 7px;border-radius:20px;background:var(--surface-muted);font-size:10px}.label i{width:5px;height:5px;border-radius:50%;background:var(--label-color)}.replies{display:flex;align-items:center;gap:6px;padding-top:4px;color:var(--text-muted);font-size:12px;font-variant-numeric:tabular-nums}.empty{padding:56px 20px;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:12px;color:var(--text-strong);font-size:14px}.empty p{margin:6px 0 0;font-size:12px}@media(max-width:600px){.issue{gap:10px;padding:14px 4px}.label{display:none}.title>a{font-size:13px}}
</style>
