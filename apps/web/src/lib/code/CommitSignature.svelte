<script lang="ts">
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import ShieldQuestion from 'lucide-svelte/icons/shield-question';
  import ShieldAlert from 'lucide-svelte/icons/shield-alert';
  let { status } = $props<{ status?: string | null }>();
</script>

{#if status === 'verified'}
  <span class="signature verified" title="SSH signature verified against the author’s registered key"><BadgeCheck size={13} />Verified</span>
{:else if status === 'invalid'}
  <span class="signature invalid" title="This signature could not be validated against the author’s registered keys"><ShieldAlert size={13} />Unverified</span>
{:else if status === 'unverified'}
  <span class="signature" title="No verified SSH signature for this author"><ShieldQuestion size={13} />Unverified</span>
{/if}

<style>
  .signature{display:inline-flex;flex:none;align-items:center;gap:4px;color:var(--text-muted);font-size:11px;font-weight:600;white-space:nowrap}.verified{color:var(--success)}.invalid{color:var(--danger)}
</style>
