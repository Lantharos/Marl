<script lang="ts">
  import type { LinkedWorkItem } from '@marl/contracts';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import CircleDotDashed from 'lucide-svelte/icons/circle-dot-dashed';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';

  let { items, context, actions } = $props<{ items: LinkedWorkItem[]; context?: { owner: string; repository: string }; actions?: import('svelte').Snippet }>();
  const href = (item: LinkedWorkItem) => `/${encodeURIComponent(item.repository.owner)}/${encodeURIComponent(item.repository.name)}/${item.kind === 'issue' ? 'issues' : 'pulls'}/${item.number}`;
  const sameRepository = (item: LinkedWorkItem) => context?.owner === item.repository.owner && context.repository === item.repository.name;
</script>

{#if items.length || actions}
  <section class="linked-work">
    <header><h2>Linked work</h2>{#if actions}{@render actions()}{/if}</header>
    {#if items.length}<div class="links">
      {#each items as item (`${item.kind}:${item.id}`)}
        <a href={href(item)} title={item.title}>
          <span class="state {item.state}" aria-label={`${item.kind === 'issue' ? 'Issue' : 'Pull'} ${item.state}`}>{#if item.kind === 'issue'}{#if item.state === 'closed'}<CircleDotDashed size={15} />{:else}<CircleDot size={15} />{/if}{:else if item.state === 'merged'}<GitMerge size={15} />{:else}<GitPullRequest size={15} />{/if}</span>
          <span class="work"><strong>{item.title}</strong><small>{#if !sameRepository(item)}{item.repository.owner}/{item.repository.name}{/if}{item.kind === 'issue' ? '#' : '!'}{item.number}{#if item.closes}<span>Closes on merge</span>{/if}</small></span>
        </a>
      {/each}
    </div>{/if}
  </section>
{/if}

<style>
  .linked-work{min-width:0}
  header{display:flex;min-height:30px;align-items:center;justify-content:space-between;gap:10px}
  h2{margin:0;color:var(--text-muted);font-size:12px;font-weight:630}
  .links{display:grid;gap:3px;margin-top:6px;padding:4px;border-radius:10px;background:var(--surface-muted)}
  a{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:start;gap:8px;padding:10px 8px;border-radius:7px;color:inherit;text-decoration:none;transition:background-color 120ms ease}
  a:hover{background:var(--surface-hover)}
  a:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
  .state{display:grid;height:19px;place-items:center;color:var(--success)}
  .state.closed,.state.draft{color:var(--text-faint)}
  .state.merged{color:var(--merged,#9670d1)}
  strong{display:-webkit-box;overflow:hidden;line-clamp:2;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--text-strong);font-size:12px;font-weight:600;line-height:1.5}
  small{display:block;margin-top:4px;overflow:hidden;color:var(--text-faint);font-size:11px;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}
  small span{margin-left:9px;color:var(--text-muted)}
  @media(prefers-reduced-motion:reduce){a{transition:none}}
</style>
