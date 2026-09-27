<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { legalVersion } from '@marl/contracts';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import { clearShellCache } from '$lib/shell-cache';

  let busy = $state(false);
  let error = $state('');

  async function accept() {
    busy = true;
    error = '';
    try {
      await api('/legal/accept', { method: 'POST', body: JSON.stringify({ version: legalVersion }) });
      clearShellCache(true);
      await invalidate('marl:shell');
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Your acceptance could not be saved.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="border-b border-line-subtle bg-brand-soft" role="region" aria-label="Updated terms">
  <div
    class="mx-auto flex w-[min(1240px,calc(100%-32px))] flex-wrap items-center gap-x-5 gap-y-2 py-3 text-sm sm:w-[min(1240px,calc(100%-48px))]"
  >
    <p class="min-w-0 flex-[1_1_320px] text-ink">
      We updated the <a class="font-semibold text-brand-strong hover:underline" href="/legal/terms">Terms of Service</a>
      and
      <a class="font-semibold text-brand-strong hover:underline" href="/legal/privacy">Privacy Policy</a>. Review and
      accept them to keep using Marl.
      {#if error}<span class="text-danger">{error}</span>{/if}
    </p>
    <Button size="small" variant="primary" loading={busy} onclick={accept}>Accept</Button>
  </div>
</div>
