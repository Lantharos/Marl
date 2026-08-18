<script lang="ts">
  import { page } from '$app/stores';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';

  const status = $derived($page.status);
  const copy = $derived.by(() => {
    if (status === 404) return { title: 'That page is not here', image: '/error-not-found.webp' };
    if (status === 403) return { title: 'You cannot access this page', image: '/error-access.webp' };
    if (status === 401) return { title: 'Sign in required', image: '/error-access.webp' };
    if (status >= 500) return { title: 'Marl hit a snag', image: '/error-repository.webp' };
    return { title: 'This page could not be opened', image: '/error-request.webp' };
  });

  function goBack() {
    if (history.length > 1) history.back();
    else location.assign('/');
  }
</script>

<svelte:head><title>{copy.title} · Marl</title></svelte:head>

<section class="error-page">
  <img class="illustration" src={copy.image} alt="" width="960" height="640" fetchpriority="high" />
  <h1>{copy.title}</h1>
  <div class="actions">
    <button onclick={goBack}><ArrowLeft size={14} />Go back</button>
    {#if status >= 500}<button onclick={() => location.reload()}><RefreshCw size={14} />Try again</button>{:else}<a href="/repositories"><BookOpen size={14} />Repositories</a>{/if}
  </div>
</section>

<style>
  .error-page{display:flex;min-height:calc(100vh - 52px);flex-direction:column;align-items:center;justify-content:center;padding:46px 24px 96px;text-align:center}.illustration{width:min(430px,88vw);height:auto;margin-bottom:-8px}h1{margin:0;color:var(--text-strong);font-size:26px;font-weight:660;letter-spacing:-.035em}.actions{display:flex;gap:7px;margin-top:24px}.actions button,.actions a{display:inline-flex;height:34px;align-items:center;gap:6px;padding:0 11px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:10px;font-weight:620;text-decoration:none}.actions button:hover,.actions a:hover{border-color:var(--border-strong);background:var(--surface-muted);color:var(--text-strong)}
</style>
