<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import { api, MarlApiError } from '$lib/api';
  import ImageUploadButton from '$lib/components/ImageUploadButton.svelte';
  import OrganizationAvatar from '$lib/components/OrganizationAvatar.svelte';
  import OrganizationSettingsShell from '$lib/components/settings/OrganizationSettingsShell.svelte';
  import SettingsAction from '$lib/components/settings/SettingsAction.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const slug = $derived($page.params.slug ?? '');
  const canEdit = $derived(data.viewerRole === 'owner');
  let name = $state(untrack(() => data.organization.name as string));
  let description = $state(untrack(() => data.organization.description as string ?? ''));
  let website = $state(untrack(() => data.organization.website as string ?? ''));
  let avatarUrl = $state<string | null>(untrack(() => data.organization.avatarUrl as string | null));
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let avatarState = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');
  let avatarInput = $state<HTMLInputElement>();

  function reset(state: 'save' | 'avatar') {
    setTimeout(() => state === 'save' ? (saveState = 'idle') : (avatarState = 'idle'), 1800);
  }

  async function save() {
    saveState = 'saving'; error = '';
    try {
      await api(`/organizations/${slug}`, { method: 'PATCH', body: JSON.stringify({ name, description, website }) });
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
  <section class="avatar-section">{#if canEdit}<ImageUploadButton state={avatarState} label="Change organization avatar" size={72} onclick={() => avatarInput?.click()}>{#snippet children()}<OrganizationAvatar name={name} src={avatarUrl} size={72} />{/snippet}</ImageUploadButton>{:else}<OrganizationAvatar name={name} src={avatarUrl} size={72} />{/if}<div><strong>Organization avatar</strong><p>{canEdit ? 'Click the avatar to change it. PNG, JPEG, or WebP up to 2 MB.' : 'Only organization owners can change this avatar.'}</p>{#if canEdit}<input bind:this={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" onchange={chooseAvatar} />{/if}</div></section>
  <section class="profile-form"><label><span>Organization name</span><input bind:value={name} disabled={!canEdit} maxlength="120" /></label><label><span>Description</span><textarea bind:value={description} disabled={!canEdit} maxlength="280" rows="4" placeholder="What does this organization build?"></textarea></label><label><span>Website</span><input bind:value={website} disabled={!canEdit} type="url" maxlength="200" placeholder="https://example.com" /></label>{#if canEdit}<footer><SettingsAction state={saveState} disabled={!name.trim()} onclick={save} /></footer>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}</section>
</OrganizationSettingsShell>

<style>
  .page-head{padding-bottom:24px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}.page-head p,.avatar-section p{margin:7px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}section{padding:24px 0;border-bottom:1px solid var(--border-subtle)}.avatar-section{display:flex;align-items:center;gap:18px}.avatar-section strong{display:block;color:var(--text-strong);font-size:13px}.avatar-section p{margin:4px 0;font-size:11px}.avatar-section input{display:none}.profile-form{display:grid;gap:18px}.profile-form label{display:grid;gap:7px}.profile-form label span{color:var(--text-strong);font-size:12px;font-weight:630}.profile-form input,.profile-form textarea{width:100%;padding:9px 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:13px}.profile-form input{height:38px}.profile-form textarea{resize:vertical;line-height:1.5}.profile-form input:focus,.profile-form textarea:focus{border-color:var(--brand)}.profile-form input:disabled,.profile-form textarea:disabled{opacity:.65}.profile-form footer{display:flex;justify-content:flex-end;padding-top:14px;border-top:1px solid var(--border-subtle)}.error{margin:0;color:var(--danger);font-size:12px}@media(max-width:620px){.avatar-section{align-items:flex-start}}
</style>
