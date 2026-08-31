<script lang="ts">
  import type { Snippet } from 'svelte';
  import LinkButton from './LinkButton.svelte';
  let { title, description, actionHref, actionLabel, action }: { title: string; description: string; actionHref?: string; actionLabel?: string; action?: Snippet } = $props();
</script>

<header class="page-header">
  <div><h1>{title}</h1><p>{description}</p></div>
  {#if action}{@render action()}{:else if actionHref && actionLabel}<LinkButton href={actionHref} variant="primary">{actionLabel}</LinkButton>{/if}
</header>

<style>
  .page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:28px}.page-header>div{min-width:0}h1{margin:0;color:var(--text-strong);font-size:28px;font-weight:660;letter-spacing:-.035em;line-height:1.1}p{margin:8px 0 0;color:var(--text-muted);font-size:14px}@media(max-width:600px){.page-header{align-items:flex-start;flex-wrap:wrap;gap:14px}.page-header>div{flex:1 1 180px}.page-header :global(.link-button){flex:0 0 auto}h1{font-size:24px}}
</style>
