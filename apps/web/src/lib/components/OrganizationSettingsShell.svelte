<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import SettingsLayout from './SettingsLayout.svelte';

  let { name, slug, active, showSecrets = true, children } = $props<{
    name: string;
    slug: string;
    active: 'access' | 'secrets';
    showSecrets?: boolean;
    children: import('svelte').Snippet;
  }>();
</script>

{#snippet sidebar()}
    <a class="back" href="/organizations"><ArrowLeft size={15} />Back to organizations</a>
    <h1>{name}</h1>
    <nav aria-label="Organization settings">
      <a class:active={active === 'access'} href="/organizations/{slug}/settings/access">People and teams</a>
      {#if showSecrets}<a class:active={active === 'secrets'} href="/organizations/{slug}/settings/secrets">CI secrets</a>{/if}
    </nav>
{/snippet}
<SettingsLayout {sidebar} content={children} />

<style>
  .back{display:inline-flex;min-height:34px;align-items:center;gap:7px;margin:0 0 22px;padding:0 8px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}.back:hover{background:var(--surface-muted);color:var(--text-strong)}h1{margin:0 0 12px;padding:0 10px;color:var(--text-muted);font-size:13px;font-weight:650}nav{display:grid;gap:2px}nav a{display:flex;min-height:38px;align-items:center;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}nav a.active,nav a:hover{background:var(--brand-soft);color:var(--text-strong)}@media(max-width:720px){nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
