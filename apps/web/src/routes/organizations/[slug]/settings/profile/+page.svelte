<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Camera from 'lucide-svelte/icons/camera';
  import { api, MarlApiError } from '$lib/api';
  import { IdentityConfirmation } from '$lib/auth/identity-confirmation.svelte';
  import Button from '$lib/components/Button.svelte';
  import IdentityConfirmationModal from '$lib/components/auth/IdentityConfirmationModal.svelte';
  import OrganizationAvatar from '$lib/components/OrganizationAvatar.svelte';
  import OrganizationSettingsShell from '$lib/components/settings/OrganizationSettingsShell.svelte';
  import SettingsAction from '$lib/components/settings/SettingsAction.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const slug = $derived($page.params.slug ?? '');
  const canEdit = $derived(data.viewerRole === 'owner');
  let name = $state(untrack(() => data.organization.name as string));
  let avatarUrl = $state<string | null>(untrack(() => data.organization.avatarUrl as string | null));
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let avatarState = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');
  let avatarInput = $state<HTMLInputElement>();
  const confirmation = new IdentityConfirmation();

  function reset(state: 'save' | 'avatar') {
    setTimeout(() => state === 'save' ? (saveState = 'idle') : (avatarState = 'idle'), 1800);
  }

  async function save() {
    saveState = 'saving'; error = '';
    try {
      await api(`/organizations/${slug}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      saveState = 'saved'; reset('save');
    } catch (cause) {
      saveState = 'idle'; error = cause instanceof MarlApiError ? cause.message : 'Organization profile could not be saved.';
    }
  }

  async function chooseAvatar(event: Event) {
    const file = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.files?.[0] : null;
    if (!file) return;
    avatarState = 'saving'; error = '';
    try {
      const result = await api<{ avatarUrl: string }>(`/organizations/${slug}/avatar`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      avatarUrl = result.avatarUrl; avatarState = 'saved'; reset('avatar');
    } catch (cause) {
      avatarState = 'idle'; error = cause instanceof MarlApiError ? cause.message : 'Organization avatar could not be updated.';
    } finally { if (avatarInput) avatarInput.value = ''; }
  }
</script>

<svelte:head><title>{name} profile · Marl</title></svelte:head>
<OrganizationSettingsShell {name} {slug} {avatarUrl} active="profile" showSecrets={data.viewerRole !== 'member'}>
  <header class="page-head"><h2>Profile</h2><p>The identity shown for this organization across Marl.</p></header>
  <section class="avatar-section"><OrganizationAvatar name={name} src={avatarUrl} size={72} /><div><strong>Organization avatar</strong><p>PNG, JPEG, or WebP. Up to 2 MB.</p>{#if canEdit}<input bind:this={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" onchange={chooseAvatar} /><Button loading={avatarState === 'saving'} disabled={avatarState !== 'idle'} onclick={() => avatarInput?.click()}><Camera size={14} />{avatarState === 'saved' ? 'Updated!' : avatarState === 'saving' ? 'Uploading' : 'Change avatar'}</Button>{/if}</div></section>
  <section class="profile-form"><label><span>Organization name</span><input bind:value={name} disabled={!canEdit} maxlength="120" /></label>{#if canEdit}<SettingsAction state={saveState} disabled={!name.trim() || confirmation.busy} onclick={() => confirmation.request(save)} />{/if}{#if error || confirmation.error}<p class="error" role="alert">{error || confirmation.error}</p>{/if}</section>
</OrganizationSettingsShell>
<IdentityConfirmationModal open={confirmation.open} method={confirmation.method} description="Confirm this organization profile change before continuing." onClose={confirmation.close} onVerified={confirmation.continue} />

<style>
  .page-head{padding-bottom:24px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}.page-head p,.avatar-section p{margin:7px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}section{padding:24px 0;border-bottom:1px solid var(--border-subtle)}.avatar-section{display:flex;align-items:center;gap:18px}.avatar-section strong{display:block;color:var(--text-strong);font-size:13px}.avatar-section p{margin:4px 0 10px;font-size:11px}.avatar-section input{display:none}.profile-form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px}.profile-form label{display:grid;gap:7px}.profile-form label span{color:var(--text-strong);font-size:12px;font-weight:630}.profile-form input{width:100%;height:38px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:13px}.profile-form input:focus{border-color:var(--brand)}.profile-form input:disabled{opacity:.65}.error{grid-column:1/-1;margin:0;color:var(--danger);font-size:12px}@media(max-width:620px){.profile-form{grid-template-columns:1fr}.avatar-section{align-items:flex-start}}
</style>
