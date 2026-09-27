<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import { api, MarlApiError } from '$lib/api';
  import ImageUploadButton from '$lib/components/controls/ImageUploadButton.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import SettingsAction from '$lib/components/settings/SettingsAction.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import UserAvatar from '$lib/components/identity/UserAvatar.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
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
    saveState = 'saving';
    error = '';
    try {
      const result = await api<{
        profile: { handle: string; displayName: string; bio: string; website: string | null; avatarUrl: string | null };
      }>('/profile', { method: 'PATCH', body: JSON.stringify({ displayName, username, bio, website }) });
      displayName = result.profile.displayName;
      username = result.profile.handle;
      bio = result.profile.bio;
      website = result.profile.website ?? '';
      saveState = 'saved';
      setTimeout(() => (saveState = 'idle'), 1800);
      await invalidateAll();
    } catch (cause) {
      saveState = 'idle';
      error = cause instanceof MarlApiError ? cause.message : 'Your profile could not be saved.';
    }
  }

  async function chooseAvatar(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    avatarState = 'saving';
    error = '';
    try {
      const result = await api<{ avatarUrl: string }>('/profile/avatar', {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file
      });
      avatarUrl = result.avatarUrl;
      avatarState = 'saved';
      setTimeout(() => (avatarState = 'idle'), 1800);
      await invalidateAll();
    } catch (cause) {
      avatarState = 'idle';
      error = cause instanceof MarlApiError ? cause.message : 'Your avatar could not be uploaded.';
    } finally {
      if (avatarInput) avatarInput.value = '';
    }
  }
</script>

<svelte:head><title>Profile · Marl</title></svelte:head>
<SettingsHeader title="Profile" description="How you appear on your public profile, commits, and discussions." />
{#if error}<Notice class="mb-4">{error}</Notice>{/if}
<form
  class="grid gap-6 surface p-5 sm:p-6"
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <section class="flex items-center gap-4">
    <ImageUploadButton
      state={avatarState}
      label="Change profile picture"
      size={72}
      round
      onclick={() => avatarInput?.click()}
      ><UserAvatar name={displayName || username} src={avatarUrl} size={72} /></ImageUploadButton
    >
    <div>
      <strong class="block text-base font-semibold text-ink-strong">Profile picture</strong>
      <p class="mt-1 text-sm text-ink-muted">PNG, JPEG, or WebP up to 2 MB</p>
      <input
        bind:this={avatarInput}
        class="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onchange={chooseAvatar}
      />
    </div>
  </section>
  <div class="grid gap-5 sm:grid-cols-2">
    <Field label="Name">
      <input class="field" bind:value={displayName} maxlength="80" autocomplete="name" data-1p-ignore required />
    </Field>
    <Field label="Username">
      <span class="flex field items-center gap-1 pr-0">
        <span class="text-ink-faint">@</span>
        <input
          class="h-10 min-w-0 flex-1 bg-transparent outline-none"
          bind:value={username}
          minlength="2"
          maxlength="39"
          pattern="[a-z0-9](?:(?:[a-z0-9._]|-)*[a-z0-9])?"
          oninput={() => (username = username.toLowerCase())}
          autocomplete="username"
          data-1p-ignore
          required
        />
      </span>
    </Field>
    <Field label="Bio" class="sm:col-span-2" hint={`${bio.length}/280`}>
      <textarea
        class="field min-h-24 resize-y py-3 leading-relaxed"
        bind:value={bio}
        maxlength="280"
        rows="4"
        placeholder="A little about you"
        data-1p-ignore></textarea>
    </Field>
    <Field label="Website" class="sm:col-span-2">
      <input
        class="field"
        bind:value={website}
        type="url"
        maxlength="200"
        placeholder="https://example.com"
        autocomplete="url"
        data-1p-ignore
      />
    </Field>
  </div>
  <footer class="flex justify-end"><SettingsAction state={saveState} label="Save profile" onclick={save} /></footer>
</form>
