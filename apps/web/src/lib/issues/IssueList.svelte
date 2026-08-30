<script lang="ts">
  import type { IssueSummary } from '@marl/contracts';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import CircleDotDashed from 'lucide-svelte/icons/circle-dot-dashed';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Time from '$lib/components/Time.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';

  let { issues, showRepository = false, emptyTitle, emptyDescription } = $props<{ issues: IssueSummary[]; showRepository?: boolean; emptyTitle: string; emptyDescription: string }>();
</script>

<section class="list">
  {#each issues as issue (issue.id)}
    <article class="row">
      <span class:closed={issue.state === 'closed'} class="state-icon">{#if issue.state === 'closed'}<CircleDotDashed size={17} />{:else}<CircleDot size={17} />{/if}</span>
      <span class="main">
        <span class="title-line"><a class="title" href="/{issue.repository.owner}/{issue.repository.name}/issues/{issue.number}">{issue.title}</a>{#if issue.labels.length}<span class="labels">{#each issue.labels.slice(0, 4) as label (label.id)}<span style:--label-color={label.color}>{label.name}</span>{/each}{#if issue.labels.length > 4}<i>+{issue.labels.length - 4}</i>{/if}</span>{/if}</span>
        <small>{#if showRepository}<a class="repository" href="/{issue.repository.owner}/{issue.repository.name}">{issue.repository.owner}/{issue.repository.name}</a> · {/if}#{issue.number} opened by <a class="author" href="/{issue.author}">{issue.authorDisplayName}</a> · <Time value={issue.updatedAt} /></small>
      </span>
      <span class="end">{#if issue.assignees.length}<span class="assignees">{#each issue.assignees.slice(0, 3) as person (person.id)}<UserAvatar name={person.displayName || person.handle} src={person.avatarUrl} size={22} />{/each}</span>{/if}{#if issue.commentCount}<span class="comments"><MessageSquare size={12} />{issue.commentCount}</span>{/if}</span>
    </article>
  {:else}
    <div class="empty"><CircleDot size={23} /><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>
  {/each}
</section>

<style>
  .list{display:grid;gap:4px}.row{position:relative;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:11px;min-height:62px;padding:9px 11px;border-radius:8px;transition:background-color 120ms ease}.row:hover{background:var(--surface-hover)}.state-icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px;background:var(--success-soft);color:var(--success)}.state-icon.closed{background:var(--surface-muted);color:var(--text-faint)}.main{min-width:0}.title-line{display:flex;min-width:0;align-items:center;gap:6px}.title,.main>small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.title{min-width:0;color:var(--text-strong);font-size:12px;font-weight:650;text-decoration:none}.title::after{position:absolute;inset:0;content:''}.main>small{margin-top:4px;color:var(--text-muted);font-size:10px}.author,.repository{position:relative;z-index:1;color:var(--text-strong);text-decoration:none}.author:hover,.repository:hover{color:var(--brand)}.labels{position:relative;z-index:1;display:flex;min-width:0;align-items:center;gap:5px;overflow:hidden}.labels span{flex:none;padding:3px 6px;border-radius:999px;background:color-mix(in srgb,var(--label-color) 15%,transparent);color:var(--label-color);font-size:8px;font-weight:650}.labels i{flex:none;color:var(--text-faint);font-size:8px;font-style:normal}.end{display:flex;align-items:center;gap:10px}.assignees{position:relative;z-index:1;display:flex}.assignees :global(.avatar){margin-left:-5px;border:2px solid var(--canvas)}.comments{display:flex;align-items:center;gap:4px;color:var(--text-faint);font-size:9px}.empty{padding:52px 20px;color:var(--text-faint);text-align:center}.empty strong{display:block;margin-top:10px;color:var(--text-strong);font-size:13px}.empty p{margin:5px 0 0;font-size:10px}@media(max-width:600px){.assignees,.labels{display:none}.row{grid-template-columns:30px minmax(0,1fr) auto;padding-inline:5px}}
</style>
