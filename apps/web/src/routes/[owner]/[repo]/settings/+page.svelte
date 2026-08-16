<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Archive from 'lucide-svelte/icons/archive';
  import Check from 'lucide-svelte/icons/check';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, StyApiError } from '$lib/api';
  import Select from '$lib/components/Select.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  let description = $state(untrack(() => data.repository.description));
  let visibility = $state(untrack(() => data.repository.visibility));
  let defaultBranch = $state(untrack(() => data.repository.defaultBranch ?? 'main'));
  let newName = $state($page.params.repo ?? '');
  let destination = $state(untrack(() => data.organizations.find((organization: { slug: string; name: string }) => organization.slug !== ($page.params.owner ?? ''))?.slug ?? ($page.params.owner ?? '')));
  let deleteConfirmation = $state('');
  let archived = $state(untrack(() => Boolean(data.repository.archivedAt)));
  let busy = $state('');
  let notice = $state('');
  let error = $state('');
  const ownerOptions = $derived(data.organizations.map((organization: { slug: string; name: string }) => ({ value: organization.slug, label: organization.slug })));

  async function run(name: string, action: () => Promise<void>) {
    if (busy) return;
    busy = name; notice = ''; error = '';
    try { await action(); }
    catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Repository settings could not be updated.'; }
    finally { busy = ''; }
  }

  function saveGeneral() { return run('general', async () => {
    await api(`/repositories/${owner}/${repo}/settings`, { method: 'PATCH', body: JSON.stringify({ description, visibility, defaultBranch }) });
    notice = 'Repository details saved.';
  }); }

  function rename() { return run('rename', async () => {
    const result = await api<{ repository: { owner: string; name: string } }>(`/repositories/${owner}/${repo}/settings/rename`, { method: 'POST', body: JSON.stringify({ name: newName }) });
    await goto(`/${result.repository.owner}/${result.repository.name}/settings`, { replaceState: true });
  }); }

  function transfer() { return run('transfer', async () => {
    const result = await api<{ repository: { owner: string; name: string } }>(`/repositories/${owner}/${repo}/settings/transfer`, { method: 'POST', body: JSON.stringify({ owner: destination }) });
    await goto(`/${result.repository.owner}/${result.repository.name}/settings`, { replaceState: true });
  }); }

  function toggleArchive() { return run('archive', async () => {
    const next = !archived;
    await api(`/repositories/${owner}/${repo}/settings`, { method: 'PATCH', body: JSON.stringify({ archived: next }) });
    archived = next; notice = next ? 'Repository archived. Git pushes are now blocked.' : 'Repository restored.';
  }); }

  function scheduleDeletion() { return run('delete', async () => {
    await api(`/repositories/${owner}/${repo}/settings/delete`, { method: 'POST', body: JSON.stringify({ confirmation: deleteConfirmation }) });
    await goto('/repositories');
  }); }
</script>

<svelte:head><title>Settings · {owner}/{repo} · Sty</title></svelte:head>
<header class="page-head"><h2>General</h2><p>Repository identity, access, and lifecycle.</p></header>
{#if notice}<p class="notice"><Check size={13} />{notice}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<section class="group">
  <header><h3>Repository details</h3><p>Shown anywhere this repository appears in Sty.</p></header>
  <label><span>Description</span><input bind:value={description} maxlength="280" placeholder="Describe this repository" /></label>
  <div class="fields"><label><span>Visibility</span><Select bind:value={visibility} ariaLabel="Repository visibility" options={[{ value: 'private', label: 'Private' }, { value: 'public', label: 'Public' }]} /></label><label><span>Default branch</span><input bind:value={defaultBranch} /></label></div>
  <footer><button class="primary" disabled={busy === 'general'} onclick={saveGeneral}>{busy === 'general' ? 'Saving…' : 'Save changes'}</button></footer>
</section>

<section class="group">
  <header><h3>Repository name</h3><p>Changing the name updates the repository URL. Existing storage remains attached to the repository identity.</p></header>
  <div class="action-row"><label><span>New name</span><input bind:value={newName} /></label><button disabled={busy === 'rename' || newName === repo || !newName.trim()} onclick={rename}>Rename</button></div>
</section>

<section class="group">
  <header><h3>Transfer ownership</h3><p>Move this repository to another organization you own.</p></header>
  <div class="action-row"><label><span>Destination</span><Select bind:value={destination} ariaLabel="Destination owner" options={ownerOptions} /></label><button disabled={busy === 'transfer' || destination === owner} onclick={transfer}>Transfer</button></div>
</section>

<section class="danger">
  <header><h3>Repository lifecycle</h3><p>Archiving is reversible. Deletion is hidden immediately and permanently purged after 30 days.</p></header>
  <div class="danger-row"><span><strong>{archived ? 'Unarchive repository' : 'Archive repository'}</strong><small>{archived ? 'Restore pushes and normal activity.' : 'Make the repository read-only without removing code.'}</small></span><button onclick={toggleArchive} disabled={busy === 'archive'}><Archive size={13} />{archived ? 'Unarchive' : 'Archive'}</button></div>
  <div class="danger-row delete"><label><strong>Delete repository</strong><small>Type <code>{owner}/{repo}</code> to schedule deletion.</small><input bind:value={deleteConfirmation} placeholder="{owner}/{repo}" /></label><button onclick={scheduleDeletion} disabled={busy === 'delete' || deleteConfirmation !== `${owner}/${repo}`}><Trash2 size={13} />Delete</button></div>
</section>

<style>
  .page-head{margin-bottom:20px}.page-head h2{margin:0;color:var(--text-strong);font-size:20px}.page-head p,.group header p,.danger header p{margin:5px 0 0;color:var(--text-faint);font-size:10px}.notice,.error{display:flex;align-items:center;gap:6px;margin:0 0 14px;font-size:10px}.notice{color:var(--success)}.error{color:var(--danger)}.group{padding:0 0 25px;margin-bottom:25px;border-bottom:1px solid var(--border-subtle)}.group h3,.danger h3{margin:0;color:var(--text-strong);font-size:13px}.group>label,.fields,.action-row{margin-top:16px}.group label,.danger label{display:block;min-width:0}.group label>span{display:block;margin-bottom:6px;color:var(--text-muted);font-size:9px;font-weight:620}input{box-sizing:border-box;width:100%;height:34px;padding:0 9px;border:1px solid var(--border);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font:inherit;font-size:10px}input:focus{border-color:var(--brand)}.fields{display:grid;grid-template-columns:180px 1fr;gap:12px}.group footer{display:flex;justify-content:flex-end;margin-top:14px}.group button,.danger button{display:inline-flex;height:32px;align-items:center;justify-content:center;gap:6px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-raised);color:var(--text);cursor:pointer;font-size:9px;font-weight:640}.group button:hover,.danger button:hover{background:var(--surface-muted)}.group button:disabled,.danger button:disabled{cursor:not-allowed;opacity:.45}.primary{border-color:var(--brand)!important;background:var(--brand)!important;color:white!important}.action-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:9px}.danger{overflow:hidden;border:1px solid color-mix(in srgb,var(--danger) 45%,var(--border));border-radius:8px}.danger>header{padding:14px}.danger-row{display:flex;min-height:70px;align-items:center;justify-content:space-between;gap:18px;padding:12px 14px;border-top:1px solid var(--border-subtle)}.danger-row strong,.danger-row small{display:block}.danger-row strong{color:var(--text-strong);font-size:10px}.danger-row small{margin-top:4px;color:var(--text-faint);font-size:9px}.danger-row code{color:var(--text-muted)}.danger-row button{flex:0 0 auto}.delete input{width:min(320px,100%);margin-top:9px}.delete button{border-color:var(--danger);color:var(--danger)}@media(max-width:560px){.fields{grid-template-columns:1fr}.danger-row{align-items:flex-start;flex-direction:column}.danger-row button{align-self:flex-end}}
</style>
