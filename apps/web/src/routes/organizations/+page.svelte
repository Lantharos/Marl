<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Plus from 'lucide-svelte/icons/plus';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import OrganizationAvatar from '$lib/components/OrganizationAvatar.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let organizations = $state(untrack(() => [...data.organizations]));
  let open = $state(false);
  let name = $state('');
  let slug = $state('');
  let baseRole = $state('read');
  let error = $state('');
  let busy = $state(false);
  let slugEdited = $state(false);
  const roles = [{ value: 'read', label: 'Read', description: 'Members can view repositories' }, { value: 'triage', label: 'Triage', description: 'Members can manage reviews and issues' }, { value: 'write', label: 'Write', description: 'Members can push code' }, { value: 'maintain', label: 'Maintain', description: 'Members can manage repository settings' }];

  $effect(() => { if ($page.url.searchParams.get('new') === '1') open = true; });

  function updateName(value: string) {
    name = value;
    if (!slugEdited) slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function closeCreate() {
    open = false;
    name = '';
    slug = '';
    baseRole = 'read';
    slugEdited = false;
    error = '';
    if ($page.url.searchParams.has('new')) void goto('/organizations', { replaceState: true, noScroll: true });
  }

  async function create() {
    busy = true; error = '';
    try {
      const result = await api<{ organization: Record<string, unknown> }>('/organizations', { method: 'POST', body: JSON.stringify({ name, slug, baseRepositoryRole: baseRole }) });
      organizations = [...organizations, result.organization];
      closeCreate();
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The organization could not be created.'; }
    finally { busy = false; }
  }
</script>

<svelte:head><title>Organizations · Marl</title></svelte:head>
<div class="page"><header><div><h1>Organizations</h1><p>Ownership, teams, and default repository access.</p></div><Button variant="primary" onclick={() => (open = true)}><Plus size={14} />New organization</Button></header>{#if error}<p class="error">{error}</p>{/if}<div class="org-list">{#each organizations as organization}<a href={`/organizations/${organization.slug}/settings/profile`}><OrganizationAvatar name={organization.name} src={organization.avatarUrl} size={34} /><div><strong>{organization.name}</strong><small>{organization.slug} · {organization.members} {organization.members === 1 ? 'member' : 'members'} · {organization.repositories} repositories</small></div><span>{organization.role}</span></a>{/each}</div></div>

{#snippet createActions()}<Button size="small" onclick={closeCreate}>Cancel</Button><Button size="small" variant="primary" disabled={busy || !name.trim() || !slug.trim()} onclick={create}>Create organization</Button>{/snippet}
<Modal {open} title="New organization" description="Organizations own repositories and define access through members and teams." onClose={closeCreate} actions={createActions}><div class="form"><label><span>Name</span><input value={name} oninput={(event) => updateName(event.currentTarget.value)} /></label><label><span>URL name</span><input value={slug} oninput={(event) => { slug = event.currentTarget.value; slugEdited = true; }} /></label><label><span>Base repository role</span><Select bind:value={baseRole} options={roles} ariaLabel="Base repository role" /></label></div></Modal>

<style>
  .page{width:min(920px,calc(100% - 40px));margin:0 auto;padding:42px 0 80px}.page>header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:1px solid var(--border-subtle)}h1{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}p{margin:7px 0 0;color:var(--text-muted);font-size:13px}.org-list a{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:76px;border-bottom:1px solid var(--border-subtle);color:var(--text);text-decoration:none}.org-list a:hover strong{color:var(--brand-strong)}.org-list strong,.org-list small{display:block}.org-list strong{color:var(--text-strong);font-size:13px}.org-list small{margin-top:4px;color:var(--text-faint);font-size:11px}.org-list a>span:last-child{color:var(--text-muted);font-size:11px}.form,.form label{display:grid;gap:8px}.form{gap:16px}.form label>span{color:var(--text-strong);font-size:12px;font-weight:620}.form input{height:38px;padding:0 9px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:13px}.error{padding:9px;background:var(--danger-soft);color:var(--danger)}
</style>
