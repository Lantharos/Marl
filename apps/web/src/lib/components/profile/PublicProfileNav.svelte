<script lang="ts">
  import BrandMark from '../BrandMark.svelte';
  import LinkButton from '../LinkButton.svelte';
  let { visible = false } = $props<{ visible?: boolean }>();
</script>

{#if visible}
  <header class="public-nav"><a href="/" aria-label="Marl home"><BrandMark /></a><nav aria-label="Account"><LinkButton variant="ghost" href="/sign-in">Sign in</LinkButton><LinkButton variant="primary" href="/sign-up">Create account</LinkButton></nav></header>
{/if}

<style>
  .public-nav{display:flex;min-height:52px;align-items:center;justify-content:space-between;gap:16px;padding:7px 24px;background:var(--surface)}
  .public-nav>a{display:flex;color:inherit;text-decoration:none}
  nav{display:flex;align-items:center;gap:6px}
  @media(max-width:600px){.public-nav{padding-inline:14px}}
</style>
