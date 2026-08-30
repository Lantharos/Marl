<script lang="ts">
  import type { WorkItemReferenceEvent } from '@marl/contracts';
  import Link2 from 'lucide-svelte/icons/link-2';
  import Time from './Time.svelte';

  let { reference } = $props<{ reference: WorkItemReferenceEvent }>();
  const href = $derived(reference.source ? `/${encodeURIComponent(reference.source.repository.owner)}/${encodeURIComponent(reference.source.repository.name)}/${reference.source.kind === 'issue' ? 'issues' : 'pulls'}/${reference.source.number}` : '');
</script>

<article class="reference-event">
  <span class="icon"><Link2 size={14} /></span>
  <p>{#if reference.source}<a {href}>{reference.source.repository.owner}/{reference.source.repository.name}{reference.source.kind === 'issue' ? '#' : '!'}{reference.source.number}</a> mentioned this in <span>{reference.source.title}</span>{:else}Referenced from private work{/if}<Time value={reference.createdAt} /></p>
</article>

<style>
  .reference-event{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:8px;padding:3px 7px}.icon{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:var(--brand-soft);color:var(--brand)}p{min-width:0;margin:0;color:var(--text-muted);font-size:10px}a{color:var(--text-strong);font-weight:650;text-decoration:none}a:hover{text-decoration:underline}p>span{color:var(--text-faint)}p :global(time){margin-left:4px}
</style>
