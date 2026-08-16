<script lang="ts">
  import { page } from '$app/stores';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';

  const status = $derived($page.status);
  const copy = $derived.by(() => {
    if (status === 404) return { title: 'That page is not here', message: 'The link may be outdated, or the repository may no longer be available.' };
    if (status === 403) return { title: 'You cannot access this page', message: 'Your account does not have permission to view this repository or resource.' };
    if (status === 401) return { title: 'Sign in required', message: 'Your session is missing or expired. Sign in and try the page again.' };
    if (status >= 500) return { title: 'Sty hit a snag', message: 'The service could not finish this request. Your repository data has not been changed.' };
    return { title: 'This page could not be opened', message: $page.error?.message || 'The request could not be completed.' };
  });

  function goBack() {
    if (history.length > 1) history.back();
    else location.assign('/');
  }
</script>

<svelte:head><title>{status} · {copy.title} · Sty</title></svelte:head>

<section class="error-page">
  <img class="illustration" src="/error-repository.webp" alt="" width="960" height="640" />
  <h1><span>{status}</span> {copy.title}</h1>
  <p>{copy.message}</p>
  <div class="actions">
    <button onclick={goBack}><ArrowLeft size={14} />Go back</button>
    {#if status >= 500}<button onclick={() => location.reload()}><RefreshCw size={14} />Try again</button>{:else}<a href="/repositories"><BookOpen size={14} />Repositories</a>{/if}
  </div>
</section>

<style>
  .error-page{display:flex;min-height:calc(100vh - 52px);flex-direction:column;align-items:center;justify-content:center;padding:46px 24px 96px;text-align:center}.illustration{width:min(430px,88vw);height:auto;margin-bottom:-8px}h1{margin:0;color:var(--text-strong);font-size:26px;font-weight:660;letter-spacing:-.035em}h1 span{color:var(--brand);font-family:"SFMono-Regular",Consolas,monospace;font-size:.7em}p{max-width:470px;margin:10px 0 0;color:var(--text-muted);font-size:11px;line-height:1.65}.actions{display:flex;gap:7px;margin-top:24px}.actions button,.actions a{display:inline-flex;height:34px;align-items:center;gap:6px;padding:0 11px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:10px;font-weight:620;text-decoration:none}.actions button:hover,.actions a:hover{border-color:var(--border-strong);background:var(--surface-muted);color:var(--text-strong)}
</style>
