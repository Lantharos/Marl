<script lang="ts">
  import { goto } from '$app/navigation';
  import type { InboxItem } from '@marl/contracts';
  import AtSign from 'lucide-svelte/icons/at-sign';
  import Check from 'lucide-svelte/icons/check';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Time from '$lib/components/Time.svelte';
  import { api } from '$lib/api';

  let { items, compact = false, emptyTitle = 'All caught up.', emptyDescription = 'Mentions, assignments, and updates will appear here.', onChange = () => {} } = $props<{ items: InboxItem[]; compact?: boolean; emptyTitle?: string; emptyDescription?: string; onChange?: () => void | Promise<void> }>();

  function reason(item: InboxItem) {
    if (item.reason === 'mention') return 'mentioned you';
    if (item.reason === 'assignment') return `assigned this ${item.kind === 'pull' ? 'pull' : 'issue'} to you`;
    if (item.reason === 'failure') return 'run you triggered failed';
    if (item.reason === 'authored') return `updated ${item.kind === 'pull' ? 'a pull' : 'an issue'} you opened`;
    return `updated ${item.kind === 'pull' ? 'a pull' : 'an issue'} you joined`;
  }

  async function open(event: MouseEvent, item: InboxItem) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (item.unread) await api(`/inbox/${item.kind}/${item.id.slice(item.id.indexOf(':') + 1)}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
    await goto(item.href);
  }

  async function setDone(item: InboxItem) {
    await api(`/inbox/${item.kind}/${item.id.slice(item.id.indexOf(':') + 1)}`, { method: 'PATCH', body: JSON.stringify({ done: !item.done }) });
    await onChange();
  }
</script>

<section class:compact class="items" aria-label="Inbox items">
  {#each items as item (item.id)}
    <article class:unread={item.unread}>
      <a href={item.href} onclick={(event) => open(event, item)}>
        <span class="kind" class:failed={item.kind === 'run'}>{#if item.reason === 'mention'}<AtSign size={16} />{:else if item.kind === 'issue'}<CircleDot size={16} />{:else if item.kind === 'pull'}<GitPullRequest size={16} />{:else}<CircleAlert size={16} />{/if}</span>
        <span class="copy"><span class="title-line"><strong>{item.title}</strong>{#if item.unread}<i aria-label="Unread"></i>{/if}</span><small><span>{item.repository.owner}/{item.repository.name}</span> · {item.kind === 'issue' ? `#${item.number}` : item.kind === 'pull' ? `!${item.number}` : `run ${item.number}`} · {reason(item)} · <Time value={item.updatedAt} /></small></span>
      </a>
      {#if !compact}<button aria-label={item.done ? 'Move back to inbox' : 'Mark as done'} title={item.done ? 'Move back to inbox' : 'Mark as done'} onclick={() => setDone(item)}>{#if item.done}<RotateCcw size={15} />{:else}<Check size={16} />{/if}</button>{/if}
    </article>
  {:else}
    <div class="empty"><span><Check size={19} /></span><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>
  {/each}
</section>

<style>
  .items{display:grid;gap:3px}.items article{display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:center;border-radius:8px}.items article:hover{background:var(--surface-hover)}.items article>a{display:grid;min-width:0;grid-template-columns:32px minmax(0,1fr);align-items:center;gap:10px;min-height:62px;padding:7px 8px;color:inherit;text-decoration:none}.kind{display:grid;width:29px;height:29px;place-items:center;border-radius:7px;background:var(--surface-muted);color:var(--text-muted)}.unread .kind{background:var(--brand-soft);color:var(--brand)}.kind.failed{background:var(--danger-soft);color:var(--danger)}.copy{min-width:0}.title-line{display:flex;min-width:0;align-items:center;gap:7px}.title-line strong,.copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.title-line strong{color:var(--text-strong);font-size:11px;font-weight:620}.title-line i{width:5px;height:5px;flex:none;border-radius:50%;background:var(--brand)}.copy small{margin-top:4px;color:var(--text-faint);font-size:9px}.copy small>span{color:var(--text-muted)}article>button{display:grid;width:30px;height:30px;border:0;border-radius:6px;background:transparent;color:var(--text-faint);cursor:pointer;place-items:center}article>button:hover{background:var(--surface-muted);color:var(--text-strong)}article>button:focus-visible{outline:1px solid var(--brand);outline-offset:2px}.compact article{grid-template-columns:minmax(0,1fr)}.compact article>a{min-height:58px;padding-inline:6px}.empty{display:grid;justify-items:start;padding:17px 0 20px}.empty>span{display:grid;width:31px;height:31px;place-items:center;border-radius:50%;background:var(--success-soft);color:var(--success)}.empty strong{margin-top:10px;color:var(--text-strong);font-size:11px}.empty p{margin:4px 0 0;color:var(--text-faint);font-size:9px}@media(max-width:560px){.items article{grid-template-columns:minmax(0,1fr) 32px}.items article>a{padding-inline:4px}.copy small{white-space:normal}.copy small>span{display:none}}
</style>
