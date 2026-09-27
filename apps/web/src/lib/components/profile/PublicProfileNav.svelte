<script lang="ts">
  import BrandMark from '../identity/BrandMark.svelte';
  import LinkButton from '../controls/LinkButton.svelte';
  let { visible = false }: { visible?: boolean } = $props();
</script>

{#if visible}
  <header class="flex min-h-14 items-center justify-between gap-4 bg-surface px-4 py-2 sm:px-6">
    <a href="/" aria-label="Marl home" class="flex"><BrandMark /></a>
    <nav aria-label="Account" class="flex items-center gap-1.5">
      <LinkButton variant="ghost" href="/sign-in">Sign in</LinkButton>
      <LinkButton variant="primary" href="/sign-up">Create account</LinkButton>
    </nav>
  </header>
{/if}
