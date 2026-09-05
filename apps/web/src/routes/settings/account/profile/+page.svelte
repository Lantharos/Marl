<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import { api, MarlApiError } from '$lib/api';
  import ImageUploadButton from '$lib/components/ImageUploadButton.svelte';
  import SettingsAction from '$lib/components/settings/SettingsAction.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let displayName = $state(untrack(() => data.profile.displayName));
  let username = $state(untrack(() => data.profile.handle));
  let bio = $state(untrack(() => data.profile.bio ?? ''));
  let website = $state(untrack(() => data.profile.website ?? ''));
  let avatarUrl = $state<string | null>(untrack(() => data.profile.avatarUrl));
  let avatarInput = $state<HTMLInputElement>();
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let avatarState = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');

  async function save() {
    saveState = 'saving'; error = '';
    try {
      const result = await api<{ profile: { handle: string; displayName: string; bio: string; website: string | null; avatarUrl: string | null } }>('/profile', { method: 'PATCH', body: JSON.stringify({ displayName, username, bio, website }) });
      displayName = result.profile.displayName; username = result.profile.handle; bio = result.profile.bio; website = result.profile.website ?? '';
      saveState = 'saved';
      setTimeout(() => (saveState = 'idle'), 1800);
      await invalidateAll();
    } catch (cause) { saveState = 'idle'; error = cause instanceof MarlApiError ? cause.message : 'Your profile could not be saved.'; }
  }

  async function chooseAvatar(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    avatarState = 'saving'; error = '';
    try {
      const result = await api<{ avatarUrl: string }>('/profile/avatar', { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      avatarUrl = result.avatarUrl; avatarState = 'saved';
      setTimeout(() => (avatarState = 'idle'), 1800);
      await invalidateAll();
    } catch (cause) { avatarState = 'idle'; error = cause instanceof MarlApiError ? cause.message : 'Your avatar could not be uploaded.'; }
    finally { if (avatarInput) avatarInput.value = ''; }
  }
</script>

<svelte:head><title>Profile · Marl</title></svelte:head>
<header class="page-head"><h2>Profile</h2><p>Your identity across repositories, reviews, and organizations.</p></header>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<form class="profile-form" onsubmit={(event) => { event.preventDefault(); void save(); }}>
  <section class="avatar-section"><ImageUploadButton state={avatarState} label="Change profile picture" size={72} round onclick={() => avatarInput?.click()}><UserAvatar name={displayName || username} src={avatarUrl} size={72} /></ImageUploadButton><div><strong>Profile picture</strong><p>Click your picture to change it. PNG, JPEG, or WebP up to 2 MB.</p><input bind:this={avatarInput} class="avatar-input" type="file" accept="image/png,image/jpeg,image/webp" onchange={chooseAvatar} /></div></section>
  <div class="fields"><label><span>Name</span><input bind:value={displayName} maxlength="80" autocomplete="name" data-1p-ignore required /></label><label><span>Username</span><div class="username"><span>@</span><input bind:value={username} minlength="2" maxlength="39" pattern="[a-z0-9](?:(?:[a-z0-9._]|-)*[a-z0-9])?" oninput={() => (username = username.toLowerCase())} autocomplete="username" data-1p-ignore required /></div></label><label><span>Bio</span><textarea bind:value={bio} maxlength="280" rows="4" placeholder="A little about you" data-1p-ignore></textarea><small>{bio.length}/280</small></label><label><span>Website</span><input bind:value={website} type="url" maxlength="200" placeholder="https://example.com" autocomplete="url" data-1p-ignore /></label></div>
  <footer><SettingsAction state={saveState} label="Save profile" onclick={save} /></footer>
</form>

<style>
  .page-head{padding-bottom:25px;}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.page-head p,.avatar-section p{margin:6px 0 0;color:var(--text-muted);font-size:11px;line-height:1.5}.error{display:flex;align-items:center;gap:7px;padding:9px 10px;border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:11px}.profile-form{padding:24px;border-radius:12px;background:var(--surface);box-shadow:var(--shadow-surface)}.avatar-section{display:flex;align-items:center;gap:16px;padding:0 0 24px;}.avatar-section strong{color:var(--text-strong);font-size:12px}.avatar-input{display:none}.fields{display:grid;gap:18px;padding:24px 0}.fields label{display:grid;gap:7px}.fields label>span{color:var(--text-strong);font-size:11px;font-weight:630}.fields input,.fields textarea{width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;outline:0;background:var(--canvas);color:var(--text-strong);font-size:13px}.fields input{height:38px}.fields textarea{resize:vertical;line-height:1.5}.fields input:focus,.fields textarea:focus{border-color:var(--brand)}.fields small{justify-self:end;color:var(--text-faint);font-size:11px}.username{display:grid;grid-template-columns:34px 1fr}.username>span{display:grid;place-items:center;border:1px solid var(--border);border-right:0;border-radius:8px 0 0 6px;background:var(--surface-muted);color:var(--text-muted);font-size:11px}.username input{border-radius:0 6px 6px 0}footer{display:flex;justify-content:flex-end;padding-top:16px;}
</style>
