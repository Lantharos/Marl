<script lang="ts">
  import BrandMark from '../BrandMark.svelte';
  let { visible = false } = $props<{ visible?: boolean }>();
</script>

{#if visible}
  <header class="public-nav"><a href="/" aria-label="Marl home"><BrandMark /></a><nav><a href="/sign-in">Sign in</a><a class="primary" href="/sign-up">Create account</a></nav></header>
{/if}

<style>
  .public-nav{display:flex;height:52px;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid var(--border-subtle)}.public-nav>a{display:flex;color:inherit;text-decoration:none}.public-nav nav{display:flex;align-items:center;gap:6px}.public-nav nav a{display:inline-flex;height:30px;align-items:center;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:11px;font-weight:620;text-decoration:none}.public-nav nav a:hover{background:var(--surface-muted);color:var(--text-strong)}.public-nav nav .primary{background:var(--brand);color:#fff}.public-nav nav .primary:hover{background:var(--brand-hover);color:#fff}
</style>
