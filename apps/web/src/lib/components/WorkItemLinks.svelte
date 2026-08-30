<script lang="ts">
  import type { LinkedWorkItem } from '@marl/contracts';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import CircleDotDashed from 'lucide-svelte/icons/circle-dot-dashed';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import Link2 from 'lucide-svelte/icons/link-2';

  let { items } = $props<{ items: LinkedWorkItem[] }>();
  const href = (item: LinkedWorkItem) => `/${encodeURIComponent(item.repository.owner)}/${encodeURIComponent(item.repository.name)}/${item.kind === 'issue' ? 'issues' : 'pulls'}/${item.number}`;
</script>

{#if items.length}
  <section class="linked-work">
    <header><Link2 size={13} />Linked work</header>
    <div>
      {#each items as item (`${item.kind}:${item.id}`)}
        <a href={href(item)} title={item.title}>
          <span class="state {item.state}">{#if item.kind === 'issue'}{#if item.state === 'closed'}<CircleDotDashed size={13} />{:else}<CircleDot size={13} />{/if}{:else if item.state === 'merged'}<GitMerge size={13} />{:else}<GitPullRequest size={13} />{/if}</span>
          <span><strong>{item.repository.owner}/{item.repository.name}{item.kind === 'issue' ? '#' : '!'}{item.number}</strong><small>{item.title}</small></span>
          {#if item.closes}<i>closes on merge</i>{/if}
        </a>
      {/each}
    </div>
  </section>
{/if}

<style>
  .linked-work{padding:12px 0;border-bottom:1px solid var(--border-subtle)}header{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:10px;font-weight:630}.linked-work>div{display:grid;gap:3px;margin-top:8px}a{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:start;gap:5px;padding:5px 3px;border-radius:5px;color:inherit;text-decoration:none}a:hover{background:var(--surface-hover)}.state{display:grid;height:18px;place-items:center;color:var(--success)}.state.closed{color:var(--text-faint)}.state.merged{color:#9670d1}strong,small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}strong{color:var(--text-strong);font-size:10px;font-weight:650}small{margin-top:2px;color:var(--text-faint);font-size:9px}i{grid-column:2;color:var(--text-faint);font-size:9px;font-style:normal}
</style>
