<script lang="ts">
  import HomeDashboard from '$lib/home/HomeDashboard.svelte';
  import LandingPage from '$lib/landing/LandingPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

{#if data.view === 'landing'}
  <LandingPage />
{:else}
  <HomeDashboard {data} />
{/if}
