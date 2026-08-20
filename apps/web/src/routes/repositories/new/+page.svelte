<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import FormShell from '$lib/components/FormShell.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';
  type Organization = { slug: string; name: string; role: 'owner' | 'admin' | 'member' };
  let { data } = $props<{ data: PageData }>();
  const organizations = $derived(data.organizations as Organization[]);
  const ownerOptions = $derived(organizations.map((organization) => ({ value: organization.slug, label: organization.name, description: organization.slug })));
  let owner = $state(untrack(() => (data.organizations as Organization[])[0]?.slug ?? '')); let name = $state(''); let visibility = $state('private'); let description = $state(''); let submitting = $state(false); let error = $state('');
  async function createRepository() {
    if (!name.trim() || submitting) return; submitting = true; error = '';
    try { await api('/repositories', { method: 'POST', body: JSON.stringify({ owner, name: name.trim(), description: description.trim(), visibility }) }); await goto(`/${owner}/${name.trim()}`); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Marl could not create the repository. Try again.'; }
    finally { submitting = false; }
  }
</script>
<svelte:head><title>New repository · Marl</title></svelte:head>
<FormShell title="Create a repository" description="A new home for code, reviews, and self-hosted automation.">
  <form class="form-grid" onsubmit={(event) => { event.preventDefault(); void createRepository(); }}>
    <div class="field-row"><label class="field"><span>Owner</span><Select bind:value={owner} ariaLabel="Repository owner" options={ownerOptions} /></label><label class="field"><span>Repository name</span><input bind:value={name} placeholder="new-project" autocomplete="off" /></label></div>
    <label class="field"><span>Description <small>Optional</small></span><textarea bind:value={description} placeholder="What is this repository for?"></textarea></label>
    <label class="field"><span>Visibility</span><Select bind:value={visibility} ariaLabel="Repository visibility" options={[{ value: 'private', label: 'Private', description: 'Only people you invite' }, { value: 'public', label: 'Public', description: 'Visible to everyone' }]} /></label>
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <div class="form-actions"><a href="/repositories">Cancel</a><button type="submit" disabled={!owner || !name.trim() || submitting}>{submitting ? 'Creating…' : 'Create repository'}</button></div>
  </form>
</FormShell>
<style>button:disabled{opacity:.48;cursor:not-allowed}.form-error{margin:0;padding:9px 11px;border-left:2px solid var(--danger);background:var(--danger-soft);color:var(--danger);font-size:10px}</style>
