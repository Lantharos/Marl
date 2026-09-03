<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Archive from 'lucide-svelte/icons/archive';
  import ArrowRightLeft from 'lucide-svelte/icons/arrow-right-left';
  import Globe2 from 'lucide-svelte/icons/globe-2';
  import GitFork from 'lucide-svelte/icons/git-fork';
  import LockKeyhole from 'lucide-svelte/icons/lock-keyhole';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import ImageUploadButton from '$lib/components/ImageUploadButton.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import RepositoryIcon from '$lib/components/RepositoryIcon.svelte';
  import Select from '$lib/components/Select.svelte';
  import SettingsAction from '$lib/components/settings/SettingsAction.svelte';
  import { completeRepositoryName, repositoryName, validRepositoryName } from '$lib/repository-name';
  import type { PageData } from './$types';

  type Organization = { slug: string; name: string };
  type BranchOption = { name: string };

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  let description = $state(untrack(() => data.repository.description));
  let iconUrl = $state<string | null>(untrack(() => data.repository.iconUrl));
  let iconState = $state<'idle' | 'saving' | 'saved'>('idle');
  let iconInput: HTMLInputElement;
  let visibility = $state(untrack(() => data.repository.visibility));
  let nextVisibility = $state(untrack(() => data.repository.visibility));
  let defaultBranch = $state(untrack(() => data.repository.defaultBranch ?? 'main'));
  let newName = $state($page.params.repo ?? '');
  let destination = $state(untrack(() => data.organizations.find((organization: Organization) => organization.slug !== ($page.params.owner ?? ''))?.slug ?? ($page.params.owner ?? '')));
  let deleteConfirmation = $state('');
  let archived = $state(untrack(() => Boolean(data.repository.archivedAt)));
  let upstream = $state(untrack(() => data.repository.upstream));
  let dialog = $state<'visibility' | 'rename' | 'transfer' | 'detach' | 'archive' | 'delete' | null>(null);
  let busy = $state('');
  let generalState = $state<'idle' | 'saving' | 'saved'>('idle');
  let visibilityState = $state<'idle' | 'saved'>('idle');
  let error = $state('');
  const ownerOptions = $derived(data.organizations.map((organization: Organization) => ({ value: organization.slug, label: organization.slug, description: organization.name })));
  const branchOptions = $derived(data.branches.map((branch: BranchOption) => ({ value: branch.name, label: branch.name })));
  const submittedNewName = $derived(completeRepositoryName(newName));
  const newNameValid = $derived(validRepositoryName(submittedNewName));

  async function run(name: string, action: () => Promise<void>) {
    if (busy) return;
    busy = name;
    error = '';
    try { await action(); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Repository settings could not be updated.'; }
    finally { busy = ''; }
  }

  async function saveGeneral() {
    generalState = 'saving';
    await run('general', async () => {
    await api(`/repositories/${owner}/${repo}/settings`, { method: 'PATCH', body: JSON.stringify({ description, defaultBranch }) });
    });
    if (error) { generalState = 'idle'; return; }
    generalState = 'saved';
    setTimeout(() => (generalState = 'idle'), 1800);
  }

  async function uploadIcon(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || iconState === 'saving') return;
    iconState = 'saving';
    error = '';
    try {
      const result = await api<{ iconUrl: string }>(`/repositories/${owner}/${repo}/icon`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      iconUrl = result.iconUrl;
      iconState = 'saved';
      await invalidateAll();
      setTimeout(() => (iconState = 'idle'), 1800);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Repository icon could not be updated.';
      iconState = 'idle';
    } finally {
      input.value = '';
    }
  }

  function changeVisibility() { return run('visibility', async () => {
    await api(`/repositories/${owner}/${repo}/settings`, { method: 'PATCH', body: JSON.stringify({ visibility: nextVisibility }) });
    visibility = nextVisibility;
    visibilityState = 'saved';
    dialog = null;
    setTimeout(() => (visibilityState = 'idle'), 1800);
  }); }

  function rename() { return run('rename', async () => {
    const result = await api<{ repository: { owner: string; name: string } }>(`/repositories/${owner}/${repo}/settings/rename`, { method: 'POST', body: JSON.stringify({ name: submittedNewName }) });
    dialog = null;
    await goto(`/${result.repository.owner}/${result.repository.name}/settings`, { replaceState: true });
  }); }

  function transfer() { return run('transfer', async () => {
    const result = await api<{ repository: { owner: string; name: string } }>(`/repositories/${owner}/${repo}/settings/transfer`, { method: 'POST', body: JSON.stringify({ owner: destination }) });
    dialog = null;
    await goto(`/${result.repository.owner}/${result.repository.name}/settings`, { replaceState: true });
  }); }

  function toggleArchive() { return run('archive', async () => {
    const next = !archived;
    await api(`/repositories/${owner}/${repo}/settings`, { method: 'PATCH', body: JSON.stringify({ archived: next }) });
    archived = next;
    dialog = null;
  }); }

  function scheduleDeletion() { return run('delete', async () => {
    await api(`/repositories/${owner}/${repo}/settings/delete`, { method: 'POST', body: JSON.stringify({ confirmation: deleteConfirmation }) });
    await goto('/repositories');
  }); }

  function detachFork() { return run('detach', async () => {
    await api(`/repositories/${owner}/${repo}/settings/detach-fork`, { method: 'POST' });
    upstream = null;
    dialog = null;
  }); }
</script>

<svelte:head><title>Settings · {owner}/{repo} · Marl</title></svelte:head>

<header class="page-head"><h2>General</h2><p>Repository identity, access, and lifecycle.</p></header>
{#if error}<p class="error" role="alert">{error}</p>{/if}

<section class="details">
  <header><div><h3>Repository details</h3><p>Shown anywhere this repository appears in Marl.</p></div><SettingsAction state={generalState} onclick={saveGeneral} /></header>
  <div class="icon-field"><ImageUploadButton state={iconState} label="Change repository icon" size={52} onclick={() => iconInput.click()}>{#snippet children()}<RepositoryIcon name={repo} src={iconUrl} size={52} />{/snippet}</ImageUploadButton><div><strong>Repository icon</strong><small>Click the icon to change it. PNG, JPEG, or WebP up to 2 MB.</small></div><input bind:this={iconInput} type="file" accept="image/png,image/jpeg,image/webp" onchange={uploadIcon} /></div>
  <label><span>Description</span><input bind:value={description} maxlength="280" placeholder="Describe this repository" /></label>
  <div class="fields single"><label><span>Default branch</span><Select bind:value={defaultBranch} ariaLabel="Default branch" options={branchOptions} /></label></div>
</section>

<section class="operations">
  <header><h3>Repository visibility</h3></header>
  <div class="operation"><span class="operation-icon">{#if visibility === 'public'}<Globe2 size={15} />{:else}<LockKeyhole size={15} />{/if}</span><div><strong>{visibility === 'public' ? 'Public repository' : 'Private repository'}</strong><small>{visibility === 'public' ? 'Anyone can view and clone this repository.' : 'Only people with access can view and clone this repository.'}</small></div><Button size="small" loading={busy === 'visibility'} onclick={() => { nextVisibility = visibility === 'public' ? 'private' : 'public'; dialog = 'visibility'; }}>{visibilityState === 'saved' ? 'Changed!' : 'Change visibility'}</Button></div>
</section>

<section class="operations">
  <header><h3>Repository ownership</h3></header>
  <div class="operation"><span class="operation-icon"><Pencil size={15} /></span><div><strong>Rename repository</strong><small>The current URL is <code>{owner}/{repo}</code>.</small></div><Button size="small" onclick={() => { newName = repositoryName(repo); dialog = 'rename'; }}>Rename</Button></div>
  <div class="operation"><span class="operation-icon"><ArrowRightLeft size={15} /></span><div><strong>Transfer ownership</strong><small>Move this repository and its full history to another organization.</small></div><Button size="small" disabled={ownerOptions.length < 2} onclick={() => (dialog = 'transfer')}>Transfer</Button></div>
</section>

<section class="danger-zone">
  <header><h3>Repository lifecycle</h3></header>
  {#if upstream}<div class="operation"><span class="operation-icon"><GitFork size={15} /></span><div><strong>Detach fork</strong><small>Remove the connection to {upstream.owner}/{upstream.name} while preserving this repository and its history.</small></div><Button size="small" onclick={() => (dialog = 'detach')}>Detach</Button></div>{/if}
  <div class="operation"><span class="operation-icon"><Archive size={15} /></span><div><strong>{archived ? 'Unarchive repository' : 'Archive repository'}</strong><small>{archived ? 'Restore pushes and normal repository activity.' : 'Make the repository read-only while preserving every object.'}</small></div><Button size="small" onclick={() => (dialog = 'archive')}>{archived ? 'Unarchive' : 'Archive'}</Button></div>
  <div class="operation delete"><span class="operation-icon"><Trash2 size={15} /></span><div><strong>Delete repository</strong><small>Hide it immediately and permanently purge it after 30 days.</small></div><Button size="small" variant="danger-soft" onclick={() => { deleteConfirmation = ''; dialog = 'delete'; }}>Delete</Button></div>
</section>

<Modal open={dialog === 'rename'} title="Rename repository" description="Links and clone URLs will change immediately." onClose={() => (dialog = null)}>
  {#snippet children()}<label class="modal-field"><span>New repository name</span><input bind:value={newName} oninput={() => (newName = repositoryName(newName))} onblur={() => (newName = submittedNewName)} maxlength="100" autocomplete="off" /></label>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant="primary" disabled={busy === 'rename' || submittedNewName === repo || !newNameValid} onclick={rename}>Rename repository</Button>{/snippet}
</Modal>

<Modal open={dialog === 'visibility'} title={`Make this repository ${nextVisibility}?`} description={nextVisibility === 'public' ? 'Anyone will be able to view and clone its code.' : 'Only people with access will be able to view and clone it.'} onClose={() => (dialog = null)}>
  {#snippet children()}<div class="modal-summary">{#if nextVisibility === 'public'}<Globe2 size={18} />{:else}<LockKeyhole size={18} />{/if}<span><strong>{owner}/{repo}</strong><small>{nextVisibility === 'public' ? 'The repository will appear on public profiles and in public search.' : 'Public profile activity from this repository will no longer be shown.'}</small></span></div>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant="primary" loading={busy === 'visibility'} onclick={changeVisibility}>Make {nextVisibility}</Button>{/snippet}
</Modal>

<Modal open={dialog === 'transfer'} title="Transfer ownership" description="The repository, pulls, settings, and Git storage move together." onClose={() => (dialog = null)}>
  {#snippet children()}<label class="modal-field"><span>Destination organization</span><Select bind:value={destination} ariaLabel="Destination organization" options={ownerOptions} /></label>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant="primary" disabled={busy === 'transfer' || destination === owner} onclick={transfer}>Transfer repository</Button>{/snippet}
</Modal>

<Modal open={dialog === 'archive'} title={archived ? 'Unarchive repository?' : 'Archive repository?'} description={archived ? 'Pushes and normal activity will be restored.' : 'Existing code remains available, but all Git pushes will be rejected.'} onClose={() => (dialog = null)}>
  {#snippet children()}<div class="modal-summary"><Archive size={18} /><span><strong>{owner}/{repo}</strong><small>{archived ? 'Return this repository to active development.' : 'You can reverse this from Settings at any time.'}</small></span></div>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant="primary" disabled={busy === 'archive'} onclick={toggleArchive}>{archived ? 'Unarchive repository' : 'Archive repository'}</Button>{/snippet}
</Modal>

<Modal open={dialog === 'detach'} title="Detach this fork?" description="This repository will become the root of an independent fork network." onClose={() => (dialog = null)}>
  {#snippet children()}<div class="modal-summary"><GitFork size={18} /><span><strong>{owner}/{repo}</strong><small>Code, branches, stars, and repository history will be preserved.</small></span></div>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant="danger-soft" loading={busy === 'detach'} onclick={detachFork}>Detach fork</Button>{/snippet}
</Modal>

<Modal open={dialog === 'delete'} title="Delete repository?" description="This hides the repository immediately. Permanent deletion is scheduled for 30 days from now." onClose={() => (dialog = null)}>
  {#snippet children()}<label class="modal-field"><span>Type <code>{owner}/{repo}</code> to confirm</span><input bind:value={deleteConfirmation} autocomplete="off" placeholder="{owner}/{repo}" /></label>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant="danger" disabled={busy === 'delete' || deleteConfirmation !== `${owner}/${repo}`} onclick={scheduleDeletion}>Delete repository</Button>{/snippet}
</Modal>


<style>
  .page-head{padding-bottom:24px;border-bottom:1px solid var(--border-subtle);margin-bottom:24px}.page-head h2{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}.page-head p,section header p{margin:7px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}.error{display:flex;align-items:center;gap:6px;margin:0 0 14px;color:var(--danger);font-size:12px}section{margin-bottom:26px}section h3{margin:0;color:var(--text-strong);font-size:13px}section>header{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:14px}.details{padding-bottom:26px;border-bottom:1px solid var(--border-subtle)}.details>label,.fields label{display:block}.details label>span,.modal-field>span{display:block;margin-bottom:7px;color:var(--text-muted);font-size:12px;font-weight:620}.details input,.modal-field input{width:100%;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:13px}.details input:focus,.modal-field input:focus{border-color:var(--brand)}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:13px}.operations,.danger-zone{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.operations>header,.danger-zone>header{margin:0;padding:15px 16px;background:var(--surface-muted)}.operation{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:11px;min-height:72px;padding:11px 14px;border-top:1px solid var(--border-subtle)}.operation-icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px;background:var(--canvas);color:var(--text-muted)}.operation strong,.operation small{display:block}.operation strong{color:var(--text-strong);font-size:13px}.operation small{margin-top:4px;color:var(--text-faint);font-size:11px;line-height:1.4}.operation code{color:var(--text-muted)}.danger-zone{border-color:color-mix(in srgb,var(--danger) 42%,var(--border))}.delete .operation-icon{background:var(--danger-soft);color:var(--danger)}.modal-field{display:block}.modal-summary{display:flex;align-items:center;gap:11px;padding:11px;border-radius:7px;background:var(--surface)}.modal-summary>:global(svg){color:var(--brand)}.modal-summary strong,.modal-summary small{display:block}.modal-summary strong{color:var(--text-strong);font-size:11px}.modal-summary small{margin-top:4px;color:var(--text-muted);font-size:9px}
  .fields.single{grid-template-columns:1fr}.icon-field{display:grid;grid-template-columns:52px minmax(0,1fr);align-items:center;gap:12px;margin-bottom:18px}.icon-field>input{display:none}.icon-field strong,.icon-field small{display:block}.icon-field strong{color:var(--text-strong);font-size:12px}.icon-field small{margin-top:4px;color:var(--text-faint);font-size:10px}
  @media(max-width:580px){.fields{grid-template-columns:1fr}.details>header{align-items:flex-start}.operation{grid-template-columns:32px minmax(0,1fr)}.operation>:global(.button){grid-column:2;justify-self:start}}
</style>
