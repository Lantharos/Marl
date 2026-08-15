<script lang="ts">
  let { title, description, actionHref, actionLabel }: { title: string; description: string; actionHref?: string; actionLabel?: string } = $props();
</script>

<header class="page-header">
  <div><h1>{title}</h1><p>{description}</p></div>
  {#if actionHref && actionLabel}<a href={actionHref}>{actionLabel}</a>{/if}
</header>

<style>
  .page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:26px}h1{margin:0;color:var(--text-strong);font-size:26px;font-weight:660;letter-spacing:-.035em;line-height:1.1}p{margin:7px 0 0;color:var(--text-muted);font-size:12px}a{display:inline-flex;height:32px;flex:0 0 auto;align-items:center;padding:0 11px;border-radius:6px;background:var(--brand);color:#fff;font-size:11px;font-weight:650;text-decoration:none}a:hover{background:var(--brand-hover)}@media(max-width:600px){.page-header{align-items:flex-start}a{display:none}h1{font-size:23px}}
</style>
