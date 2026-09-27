<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { api, MarlApiError } from '$lib/api';
  import ImageUploadButton from '$lib/components/controls/ImageUploadButton.svelte';
  import OrganizationAvatar from '$lib/components/identity/OrganizationAvatar.svelte';
  import OrganizationSettingsShell from '$lib/components/settings/OrganizationSettingsShell.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import SettingsAction from '$lib/components/settings/SettingsAction.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const slug = $derived(page.params.slug ?? '');
  const canEdit = $derived(data.viewerRole === 'owner');
  let name = $state(untrack(() => data.organization.name));
  let description = $state(untrack(() => data.organization.description ?? ''));
  let website = $state(untrack(() => data.organization.website ?? ''));
  let avatarUrl = $state<string | null>(untrack(() => data.organization.avatarUrl));
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let avatarState = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');
  let avatarInput = $state<HTMLInputElement>();

  function reset(state: 'save' | 'avatar') {
    setTimeout(() => (state === 'save' ? (saveState = 'idle') : (avatarState = 'idle')), 1800);
  }

  async function save() {
    saveState = 'saving';
    error = '';
    try {
      await api(`/organizations/${slug}`, { method: 'PATCH', body: JSON.stringify({ name, description, website }) });
      saveState = 'saved';
      reset('save');
    } catch (cause) {
      saveState = 'idle';
      error = cause instanceof MarlApiError ? cause.message : 'Organization profile could not be saved.';
    }
  }

  async function chooseAvatar(event: Event) {
    const file = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.files?.[0] : null;
    if (!file) return;
    avatarState = 'saving';
    error = '';
    try {
      const result = await api<{ avatarUrl: string }>(`/organizations/${slug}/avatar`, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file
      });
      avatarUrl = result.avatarUrl;
      avatarState = 'saved';
      reset('avatar');
    } catch (cause) {
      avatarState = 'idle';
      error = cause instanceof MarlApiError ? cause.message : 'Organization avatar could not be updated.';
    } finally {
      if (avatarInput) avatarInput.value = '';
    }
  }
</script>

<svelte:head><title>{name} profile · Marl</title></svelte:head>
<OrganizationSettingsShell {name} {slug} {avatarUrl} active="profile" showSecrets={data.viewerRole !== 'member'}>
  <SettingsHeader title="Profile" description="The identity shown for this organization across Marl." />
  {#if error}<Notice class="mb-4">{error}</Notice>{/if}
  <div class="grid gap-6 surface p-5 sm:p-6">
    <section class="flex items-center gap-4">
      {#if canEdit}<ImageUploadButton
          state={avatarState}
          label="Change organization avatar"
          size={72}
          onclick={() => avatarInput?.click()}
          ><OrganizationAvatar {name} src={avatarUrl} size={72} /></ImageUploadButton
        >{:else}<OrganizationAvatar {name} src={avatarUrl} size={72} />{/if}
      <div>
        <strong class="block text-base font-semibold text-ink-strong">Organization avatar</strong>
        <p class="mt-1 text-sm text-ink-muted">
          {canEdit ? 'PNG, JPEG, or WebP up to 2 MB.' : 'Only organization owners can change this avatar.'}
        </p>
        {#if canEdit}<input
            bind:this={avatarInput}
            class="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onchange={chooseAvatar}
          />{/if}
      </div>
    </section>
    <Field label="Organization name"
      ><input class="field" bind:value={name} disabled={!canEdit} maxlength="120" /></Field
    >
    <Field label="Description" hint={canEdit ? `${description.length}/280` : undefined}>
      <textarea
        class="field min-h-24 resize-y py-3 leading-relaxed"
        bind:value={description}
        disabled={!canEdit}
        maxlength="280"
        rows="4"
        placeholder="What does this organization build?"></textarea>
    </Field>
    <Field label="Website">
      <input
        class="field"
        bind:value={website}
        disabled={!canEdit}
        type="url"
        maxlength="200"
        placeholder="https://example.com"
      />
    </Field>
    {#if canEdit}<footer class="flex justify-end">
        <SettingsAction state={saveState} disabled={!name.trim()} onclick={save} />
      </footer>{/if}
  </div>
</OrganizationSettingsShell>
