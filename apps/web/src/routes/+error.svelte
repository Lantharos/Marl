<script lang="ts">
  import { page } from '$app/state';
  import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Button from '$lib/components/Button.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import ErrorPage from '$lib/errors/ErrorPage.svelte';
  import '$lib/errors/error-page.css';

  const status = $derived(page.status);
  const copy = $derived.by(() => {
    if (status === 400) return { title: 'Hm, that’s not right.', scene: 'request' };
    if (status === 401) return { title: 'Who are you, again?', scene: 'access' };
    if (status === 403) return { title: 'This door’s locked.', scene: 'access' };
    if (status === 404) return { title: 'This is a dead end.', scene: 'not-found' };
    if (status === 429) return { title: 'Woah, slow down.', scene: 'rate-limit' };
    if (status === 408 || status === 504) return { title: 'That took too long.', scene: 'timeout' };
    if (status === 410) return { title: 'Gone for good.', scene: 'gone' };
    if (status === 503) return { title: 'Marl needs a minute.', scene: 'server' };
    if (status >= 500) return { title: 'That one’s on us.', scene: 'server' };
    return { title: 'This page couldn’t\nbe opened.', scene: 'request' };
  });
  const signInHref = $derived(`/sign-in?returnTo=${encodeURIComponent(page.url.pathname + page.url.search)}`);
  const canRetry = $derived(status === 408 || status >= 500);
</script>

<svelte:head><title>{copy.title.replace('\n', ' ')} · Marl</title><meta name="robots" content="noindex, nofollow" /></svelte:head>

<ErrorPage {status} title={copy.title} scene={copy.scene}>
  {#if status === 401}
    <LinkButton variant="primary" href={signInHref}>Sign in<ArrowUpRight size={15} /></LinkButton>
  {:else if canRetry}
    <Button variant="primary" onclick={() => location.reload()}><RefreshCw size={15} />Try again</Button>
  {/if}
  <LinkButton variant={status === 401 || canRetry ? 'ghost' : 'primary'} href="/">Back to Marl<ArrowUpRight size={15} /></LinkButton>
</ErrorPage>
