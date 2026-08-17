<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import Camera from 'lucide-svelte/icons/camera';
  import Check from 'lucide-svelte/icons/check';
  import { api, StyApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let displayName = $state(untrack(() => data.profile.displayName));
  let username = $state(untrack(() => data.profile.handle));
  let bio = $state(untrack(() => data.profile.bio ?? ''));
  let website = $state(untrack(() => data.profile.website ?? ''));
  let avatarUrl = $state<string | null>(untrack(() => data.profile.avatarUrl));
  let avatarInput = $state<HTMLInputElement>();
  let busy = $state('');
  let notice = $state('');
  let error = $state('');
  const initial = $derived((displayName || username).slice(0, 1).toUpperCase());

  async function save() {
    busy = 'profile'; error = ''; notice = '';
    try {
      const result = await api<{ profile: { handle: string; displayName: string; bio: string; website: string | null; avatarUrl: string | null } }>('/profile', { method: 'PATCH', body: JSON.stringify({ displayName, username, bio, website }) });
      displayName = result.profile.displayName; username = result.profile.handle; bio = result.profile.bio; website = result.profile.website ?? '';
      notice = 'Profile saved.';
      await invalidateAll();
    } catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Your profile could not be saved.'; }
    finally { busy = ''; }
  }

  async function chooseAvatar(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = 'avatar'; error = ''; notice = '';
    try {
      const result = await api<{ avatarUrl: string }>('/profile/avatar', { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      avatarUrl = result.avatarUrl; notice = 'Avatar updated.';
      await invalidateAll();
    } catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Your avatar could not be uploaded.'; }
    finally { busy = ''; if (avatarInput) avatarInput.value = ''; }
  }
</script>

<svelte:head><title>Profile · Sty</title></svelte:head>
<header class="page-head"><h2>Profile</h2><p>Your identity across repositories, reviews, and organizations.</p></header>
{#if notice}<p class="notice"><Check size={13} />{notice}</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
<form onsubmit={(event) => { event.preventDefault(); void save(); }}>
  <section class="avatar-section"><div class="avatar">{#if avatarUrl}<img src={avatarUrl} alt="" />{:else}{initial}{/if}</div><div><strong>Profile picture</strong><p>PNG, JPEG, or WebP. Up to 2 MB.</p><input bind:this={avatarInput} class="avatar-input" type="file" accept="image/png,image/jpeg,image/webp" onchange={chooseAvatar} /><button type="button" disabled={busy === 'avatar'} onclick={() => avatarInput?.click()}><Camera size={14} />{busy === 'avatar' ? 'Uploading…' : 'Change avatar'}</button></div></section>
  <div class="fields"><label><span>Name</span><input bind:value={displayName} maxlength="80" autocomplete="name" required /></label><label><span>Username</span><div class="username"><span>@</span><input bind:value={username} minlength="2" maxlength="39" pattern="[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?" oninput={() => (username = username.toLowerCase())} autocomplete="username" required /></div></label><label><span>Bio</span><textarea bind:value={bio} maxlength="280" rows="4" placeholder="A little about you"></textarea><small>{bio.length}/280</small></label><label><span>Website</span><input bind:value={website} type="url" maxlength="200" placeholder="https://example.com" autocomplete="url" /></label></div>
  <footer><button class="primary" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button></footer>
</form>

<style>
  .page-head{padding-bottom:25px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.page-head p,.avatar-section p{margin:6px 0 0;color:var(--text-muted);font-size:10px;line-height:1.5}.notice,.error{display:flex;align-items:center;gap:7px;padding:9px 10px;border-radius:6px;font-size:10px}.notice{background:var(--success-soft);color:var(--success)}.error{background:var(--danger-soft);color:var(--danger)}.avatar-section{display:flex;align-items:center;gap:16px;padding:22px 0;border-bottom:1px solid var(--border-subtle)}.avatar{display:grid;width:72px;height:72px;flex:0 0 auto;overflow:hidden;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:22px;font-weight:760}.avatar img{width:100%;height:100%;object-fit:cover}.avatar-section strong{color:var(--text-strong);font-size:12px}.avatar-input{display:none}.fields{display:grid;gap:18px;padding:24px 0}.fields label{display:grid;gap:7px}.fields label>span{color:var(--text-strong);font-size:10px;font-weight:630}.fields input,.fields textarea{width:100%;padding:9px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:11px}.fields input{height:38px}.fields textarea{resize:vertical;line-height:1.5}.fields input:focus,.fields textarea:focus{border-color:var(--brand)}.fields small{justify-self:end;color:var(--text-faint);font-size:9px}.username{display:grid;grid-template-columns:34px 1fr}.username>span{display:grid;place-items:center;border:1px solid var(--border-strong);border-right:0;border-radius:6px 0 0 6px;background:var(--surface-muted);color:var(--text-muted);font-size:11px}.username input{border-radius:0 6px 6px 0}button{display:inline-flex;height:34px;align-items:center;justify-content:center;gap:7px;margin-top:10px;padding:0 11px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:10px;font-weight:630}button:hover{background:var(--surface-muted)}button.primary{margin:0;border-color:var(--brand);background:var(--brand);color:white}footer{display:flex;justify-content:flex-end;padding-top:16px;border-top:1px solid var(--border-subtle)}
</style>
