<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Archive from 'lucide-svelte/icons/archive';
  import ArrowRightLeft from 'lucide-svelte/icons/arrow-right-left';
  import Check from 'lucide-svelte/icons/check';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, StyApiError } from '$lib/api';
  import Modal from '$lib/components/Modal.svelte';
  import Select from '$lib/components/Select.svelte';
  import type { PageData } from './$types';

  type Organization = { slug: string; name: string };
  type BranchOption = { name: string };

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  let description = $state(untrack(() => data.repository.description));
  let visibility = $state(untrack(() => data.repository.visibility));
  let defaultBranch = $state(untrack(() => data.repository.defaultBranch ?? 'main'));
  let newName = $state($page.params.repo ?? '');
  let destination = $state(untrack(() => data.organizations.find((organization: Organization) => organization.slug !== ($page.params.owner ?? ''))?.slug ?? ($page.params.owner ?? '')));
  let deleteConfirmation = $state('');
  let archived = $state(untrack(() => Boolean(data.repository.archivedAt)));
  let dialog = $state<'rename' | 'transfer' | 'archive' | 'delete' | null>(null);
  let busy = $state('');
  let notice = $state('');
  let error = $state('');
  const ownerOptions = $derived(data.organizations.map((organization: Organization) => ({ value: organization.slug, label: organization.slug, description: organization.name })));
  const branchOptions = $derived(data.branches.map((branch: BranchOption) => ({ value: branch.name, label: branch.name })));

  async function run(name: string, action: () => Promise<void>) {
    if (busy) return;
    busy = name;
    notice = '';
    error = '';
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
    notice = next ? 'Repository archived. Git pushes are now blocked.' : 'Repository restored.';
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

<section class="details">
  <header><div><h3>Repository details</h3><p>Shown anywhere this repository appears in Sty.</p></div><button class="primary" disabled={busy === 'general'} onclick={saveGeneral}>{busy === 'general' ? 'Saving…' : 'Save changes'}</button></header>
  <label><span>Description</span><input bind:value={description} maxlength="280" placeholder="Describe this repository" /></label>
  <div class="fields"><label><span>Visibility</span><Select bind:value={visibility} ariaLabel="Repository visibility" options={[{ value: 'private', label: 'Private', description: 'Only organization members can view it' }, { value: 'public', label: 'Public', description: 'Anyone can view the code' }]} /></label><label><span>Default branch</span><Select bind:value={defaultBranch} ariaLabel="Default branch" options={branchOptions} /></label></div>
</section>

<section class="operations">
  <header><h3>Repository ownership</h3><p>Change the repository URL or move it to another organization.</p></header>
  <div class="operation"><span class="operation-icon"><Pencil size={15} /></span><div><strong>Rename repository</strong><small>The current URL is <code>{owner}/{repo}</code>.</small></div><button onclick={() => { newName = repo; dialog = 'rename'; }}>Rename</button></div>
  <div class="operation"><span class="operation-icon"><ArrowRightLeft size={15} /></span><div><strong>Transfer ownership</strong><small>Move this repository and its full history to another organization.</small></div><button disabled={ownerOptions.length < 2} onclick={() => (dialog = 'transfer')}>Transfer</button></div>
</section>

<section class="danger-zone">
  <header><h3>Repository lifecycle</h3><p>These actions affect Git access and repository availability.</p></header>
  <div class="operation"><span class="operation-icon"><Archive size={15} /></span><div><strong>{archived ? 'Unarchive repository' : 'Archive repository'}</strong><small>{archived ? 'Restore pushes and normal repository activity.' : 'Make the repository read-only while preserving every object.'}</small></div><button onclick={() => (dialog = 'archive')}>{archived ? 'Unarchive' : 'Archive'}</button></div>
  <div class="operation delete"><span class="operation-icon"><Trash2 size={15} /></span><div><strong>Delete repository</strong><small>Hide it immediately and permanently purge it after 30 days.</small></div><button onclick={() => { deleteConfirmation = ''; dialog = 'delete'; }}>Delete</button></div>
</section>

<Modal open={dialog === 'rename'} title="Rename repository" description="Links and clone URLs will change immediately." onClose={() => (dialog = null)}>
  {#snippet children()}<label class="modal-field"><span>New repository name</span><input bind:value={newName} autocomplete="off" /></label>{/snippet}
  {#snippet actions()}<button onclick={() => (dialog = null)}>Cancel</button><button class="primary" disabled={busy === 'rename' || newName === repo || !newName.trim()} onclick={rename}>Rename repository</button>{/snippet}
</Modal>

<Modal open={dialog === 'transfer'} title="Transfer ownership" description="The repository, pull requests, settings, and Git storage move together." onClose={() => (dialog = null)}>
  {#snippet children()}<label class="modal-field"><span>Destination organization</span><Select bind:value={destination} ariaLabel="Destination organization" options={ownerOptions} /></label>{/snippet}
  {#snippet actions()}<button onclick={() => (dialog = null)}>Cancel</button><button class="primary" disabled={busy === 'transfer' || destination === owner} onclick={transfer}>Transfer repository</button>{/snippet}
</Modal>

<Modal open={dialog === 'archive'} title={archived ? 'Unarchive repository?' : 'Archive repository?'} description={archived ? 'Pushes and normal activity will be restored.' : 'Existing code remains available, but all Git pushes will be rejected.'} onClose={() => (dialog = null)}>
  {#snippet children()}<div class="modal-summary"><Archive size={18} /><span><strong>{owner}/{repo}</strong><small>{archived ? 'Return this repository to active development.' : 'You can reverse this from Settings at any time.'}</small></span></div>{/snippet}
  {#snippet actions()}<button onclick={() => (dialog = null)}>Cancel</button><button class="primary" disabled={busy === 'archive'} onclick={toggleArchive}>{archived ? 'Unarchive repository' : 'Archive repository'}</button>{/snippet}
</Modal>

<Modal open={dialog === 'delete'} title="Delete repository?" description="This hides the repository immediately. Permanent deletion is scheduled for 30 days from now." onClose={() => (dialog = null)}>
  {#snippet children()}<label class="modal-field"><span>Type <code>{owner}/{repo}</code> to confirm</span><input bind:value={deleteConfirmation} autocomplete="off" placeholder="{owner}/{repo}" /></label>{/snippet}
  {#snippet actions()}<button onclick={() => (dialog = null)}>Cancel</button><button class="delete-button" disabled={busy === 'delete' || deleteConfirmation !== `${owner}/${repo}`} onclick={scheduleDeletion}>Delete repository</button>{/snippet}
</Modal>

<style>
  .page-head{margin-bottom:22px}.page-head h2{margin:0;color:var(--text-strong);font-size:21px}.page-head p,section header p{margin:5px 0 0;color:var(--text-faint);font-size:10px}.notice,.error{display:flex;align-items:center;gap:6px;margin:0 0 14px;font-size:10px}.notice{color:var(--success)}.error{color:var(--danger)}section{margin-bottom:26px}section h3{margin:0;color:var(--text-strong);font-size:13px}section>header{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:14px}.details{padding-bottom:26px;border-bottom:1px solid var(--border-subtle)}.details>label,.fields label{display:block}.details label>span,.modal-field>span{display:block;margin-bottom:7px;color:var(--text-muted);font-size:9px;font-weight:620}.details input,.modal-field input{width:100%;height:37px;padding:0 10px;border:1px solid var(--border);border-radius:7px;outline:0;background:var(--surface);color:var(--text-strong);font-size:11px}.details input:focus,.modal-field input:focus{border-color:var(--brand)}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:13px}.primary,section button,:global(.modal>footer button){display:inline-flex;height:32px;align-items:center;justify-content:center;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:9px;font-weight:640}.primary{border-color:var(--brand)!important;background:var(--brand)!important;color:white!important}button:disabled{cursor:not-allowed;opacity:.42}.operations,.danger-zone{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.operations>header,.danger-zone>header{margin:0;padding:15px 16px;background:var(--surface-muted)}.operation{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:11px;min-height:72px;padding:11px 14px;border-top:1px solid var(--border-subtle)}.operation-icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px;background:var(--canvas);color:var(--text-muted)}.operation strong,.operation small{display:block}.operation strong{color:var(--text-strong);font-size:10px}.operation small{margin-top:4px;color:var(--text-faint);font-size:9px;line-height:1.4}.operation code{color:var(--text-muted)}.danger-zone{border-color:color-mix(in srgb,var(--danger) 42%,var(--border))}.delete .operation-icon{background:var(--danger-soft);color:var(--danger)}.delete button,.delete-button{border-color:var(--danger)!important;background:var(--danger-soft)!important;color:var(--danger)!important}.modal-field{display:block}.modal-summary{display:flex;align-items:center;gap:11px;padding:11px;border-radius:7px;background:var(--surface)}.modal-summary>:global(svg){color:var(--brand)}.modal-summary strong,.modal-summary small{display:block}.modal-summary strong{color:var(--text-strong);font-size:11px}.modal-summary small{margin-top:4px;color:var(--text-muted);font-size:9px}
  @media(max-width:580px){.fields{grid-template-columns:1fr}.details>header{align-items:flex-start}.operation{grid-template-columns:32px minmax(0,1fr)}.operation>button{grid-column:2;justify-self:start}}
</style>
