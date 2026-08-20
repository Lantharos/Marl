<script lang="ts">
  import { page } from '$app/stores';
  import SecretSettings from '$lib/components/SecretSettings.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
</script>

<svelte:head><title>Secrets · {$page.params.slug} · Marl</title></svelte:head>
<div class="layout"><aside><h1>{$page.params.slug}</h1><nav><a href={`/organizations/${$page.params.slug}/settings/access`}>People and teams</a><a class="active" href={`/organizations/${$page.params.slug}/settings/secrets`}>CI secrets</a><a href="/organizations">All organizations</a></nav></aside><main><SecretSettings initialSecrets={data.secrets} endpoint={`/organizations/${$page.params.slug}/secrets`} scope="organization" /></main></div>

<style>
  .layout{display:grid;width:min(1120px,calc(100% - 40px));grid-template-columns:205px minmax(0,800px);gap:42px;margin:0 auto;padding:42px 0 80px}aside{position:sticky;top:76px;align-self:start}aside h1{margin:0 0 12px;padding:0 10px;color:var(--text-muted);font-size:12px}nav{display:grid;gap:2px}nav a{display:flex;min-height:38px;align-items:center;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}nav a.active,nav a:hover{background:var(--brand-soft);color:var(--text-strong)}@media(max-width:760px){.layout{grid-template-columns:1fr}aside{position:static}}
</style>
