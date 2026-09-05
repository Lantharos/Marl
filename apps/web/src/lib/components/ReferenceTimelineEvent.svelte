<script lang="ts">
  import type { WorkItemReferenceEvent } from '@marl/contracts';
  import Time from './Time.svelte';

  let { reference } = $props<{ reference: WorkItemReferenceEvent }>();
  const href = $derived(reference.source ? `/${encodeURIComponent(reference.source.repository.owner)}/${encodeURIComponent(reference.source.repository.name)}/${reference.source.kind === 'issue' ? 'issues' : 'pulls'}/${reference.source.number}` : '');
</script>

<article class="reference-event">
  <span class="mark"></span>
  <p>{#if reference.source}<a {href}>{reference.source.repository.owner}/{reference.source.repository.name}{reference.source.kind === 'issue' ? '#' : '!'}{reference.source.number}</a> mentioned this in <span>{reference.source.title}</span>{:else}Referenced from private work{/if}<Time value={reference.createdAt} /></p>
</article>

<style>
  .reference-event{display:grid;grid-template-columns:10px minmax(0,1fr);align-items:start;gap:9px;padding:5px 12px}.mark{width:5px;height:5px;margin-top:7px;border-radius:50%;background:var(--brand)}p{min-width:0;margin:0;color:var(--text-muted);font-size:11px;line-height:1.55}a{color:var(--text-strong);font-weight:650;text-decoration:none}a:hover{text-decoration:underline}p>span{color:var(--text-faint)}p :global(time){margin-left:4px}
</style>
