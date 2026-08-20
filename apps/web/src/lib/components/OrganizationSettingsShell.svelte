<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';

  let { name, slug, active, showSecrets = true, children } = $props<{
    name: string;
    slug: string;
    active: 'access' | 'secrets';
    showSecrets?: boolean;
    children: import('svelte').Snippet;
  }>();
</script>

<div class="organization-settings">
  <aside>
    <a class="back" href="/organizations"><ArrowLeft size={15} />Back to organizations</a>
    <h1>{name}</h1>
    <nav aria-label="Organization settings">
      <a class:active={active === 'access'} href="/organizations/{slug}/settings/access">People and teams</a>
      {#if showSecrets}<a class:active={active === 'secrets'} href="/organizations/{slug}/settings/secrets">CI secrets</a>{/if}
    </nav>
  </aside>
  <main>{@render children()}</main>
</div>

<style>
  .organization-settings{display:grid;width:min(1120px,calc(100% - 40px));grid-template-columns:215px minmax(0,800px);gap:42px;margin:0 auto;padding:34px 0 80px}.organization-settings aside{position:sticky;top:76px;align-self:start}.back{display:inline-flex;min-height:34px;align-items:center;gap:7px;margin:0 0 22px;padding:0 8px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}.back:hover{background:var(--surface-muted);color:var(--text-strong)}h1{margin:0 0 12px;padding:0 10px;color:var(--text-strong);font-size:13px;font-weight:650}.organization-settings nav{display:grid;gap:2px}.organization-settings nav a{display:flex;min-height:38px;align-items:center;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}.organization-settings nav a.active,.organization-settings nav a:hover{background:var(--brand-soft);color:var(--text-strong)}main{min-width:0}@media(max-width:760px){.organization-settings{grid-template-columns:1fr;gap:28px}.organization-settings aside{position:static}.organization-settings nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
