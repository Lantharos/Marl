<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import type { ReleaseDetail, RepositoryTag } from '@marl/contracts';
  import Button from '#lib/components/controls/Button.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import ConfirmDialog from '#lib/components/overlays/ConfirmDialog.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
  import { api, MarlApiError } from '#lib/api.js';
  import { releasePath } from '../release-path';
  import { releaseState } from '../release-state';
  import ReleaseFiles from './ReleaseFiles.svelte';
  import ReleaseTarget from './ReleaseTarget.svelte';
  import { ReleaseUploads } from './release-uploads.svelte';

  type Branch = { name: string; commitId: string };
  type Kind = 'latest' | 'stable' | 'prerelease';
  let {
    owner,
    repository,
    defaultBranch,
    branches,
    tags,
    release
  }: {
    owner: string;
    repository: string;
    defaultBranch: string;
    branches: Branch[];
    tags: RepositoryTag[];
    release?: ReleaseDetail;
  } = $props();

  const kinds = [
    { value: 'latest', label: 'Latest' },
    { value: 'stable', label: 'Release' },
    { value: 'prerelease', label: 'Prerelease' }
  ] as const;
  const kindHints: Record<Kind, string> = {
    latest: 'Featured as the recommended version to download.',
    stable: 'Published without replacing the latest release.',
    prerelease: 'Marked as a preview, beta, or release candidate.'
  };
  const initialKind = untrack((): Kind => {
    if (!release) return 'latest';
    const state = releaseState(release);
    return state === 'draft' ? (release.prerelease ? 'prerelease' : 'latest') : state;
  });
  let tagName = $state(untrack(() => release?.tagName ?? ''));
  let target = $state(untrack(() => release?.targetBranch ?? release?.targetCommitId ?? defaultBranch));
  let name = $state(untrack(() => release?.name ?? ''));
  let body = $state(untrack(() => release?.body ?? ''));
  let kind = $state(initialKind);
  const uploads = new ReleaseUploads(
    untrack(() => owner),
    untrack(() => repository),
    untrack(() => release?.assets ?? [])
  );
  let saving = $state<'draft' | 'publish' | null>(null);
  let notesUploading = $state(false);
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let error = $state(
    page.url.searchParams.get('upload') === 'failed'
      ? 'The release was kept as a draft because one or more files could not be uploaded.'
      : page.url.searchParams.get('publish') === 'failed'
        ? 'The files were uploaded, but the Git tag could not be published. The release remains a draft.'
        : ''
  );
  const published = $derived(Boolean(release && !release.draft));
  const existingTag = $derived(published ? undefined : tags.find((tag) => tag.name === tagName.trim()));
  const resolvedTarget = $derived(existingTag?.targetCommitId ?? target);
  const blocked = $derived(
    Boolean(saving) || notesUploading || uploads.uploading || !tagName.trim() || !resolvedTarget
  );

  function fields(draft: boolean) {
    const shared = { name: name.trim(), body, prerelease: kind === 'prerelease', makeLatest: kind === 'latest' };
    return published ? shared : { ...shared, tagName: tagName.trim(), target: resolvedTarget, draft };
  }

  async function addFiles(files: File[]) {
    uploads.add(files);
    if (release) await uploads.uploadPending(release.id);
  }

  async function save(publish: boolean) {
    if (blocked) return;
    saving = publish ? 'publish' : 'draft';
    error = '';
    try {
      if (release) {
        await api(`/repositories/${owner}/${repository}/releases/${release.id}`, {
          method: 'PATCH',
          body: JSON.stringify(fields(!publish))
        });
        await goto(releasePath(owner, repository, tagName.trim()));
        return;
      }
      const deferred = uploads.pending.length > 0;
      const created = await api<{ release: { id: string; tagName: string } }>(
        `/repositories/${owner}/${repository}/releases`,
        { method: 'POST', body: JSON.stringify(fields(deferred || !publish)) }
      );
      const editPath = `/${owner}/${repository}/releases/edit/${created.release.id}`;
      if (deferred && !(await uploads.uploadPending(created.release.id))) return goto(`${editPath}?upload=failed`);
      if (deferred && publish) {
        try {
          await api(`/repositories/${owner}/${repository}/releases/${created.release.id}`, {
            method: 'PATCH',
            body: JSON.stringify(fields(false))
          });
        } catch {
          return goto(`${editPath}?publish=failed`);
        }
      }
      await goto(releasePath(owner, repository, created.release.tagName));
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The release could not be saved.';
      saving = null;
    }
  }

  async function remove() {
    if (!release || deleting) return;
    deleting = true;
    error = '';
    try {
      await api(`/repositories/${owner}/${repository}/releases/${release.id}`, { method: 'DELETE' });
      await goto(`/${owner}/${repository}/releases`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The release could not be deleted.';
      deleting = false;
      confirmDelete = false;
    }
  }
</script>

<h1 class="mb-7 text-2xl font-semibold tracking-tight text-ink-strong sm:text-3xl">
  {release ? (published ? 'Edit release' : 'Edit draft') : 'New release'}
</h1>
{#if error}<Notice class="mb-5">{error}</Notice>{/if}

<form
  class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"
  onsubmit={(event) => {
    event.preventDefault();
    void save(true);
  }}
>
  <div class="grid min-w-0 gap-6">
    <label class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Title</span>
      <input
        class="h-12 field text-lg font-semibold"
        bind:value={name}
        maxlength="240"
        placeholder={tagName.trim() || 'Release title'}
        data-1p-ignore
      />
    </label>
    <div class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Release notes</span>
      <MarkdownComposer
        bind:value={body}
        bind:uploading={notesUploading}
        context={{ owner, repository }}
        disabled={Boolean(saving) || deleting}
        placeholder="What changed, what to watch out for, and who helped"
        minHeight={440}
      />
    </div>
    <ReleaseFiles {uploads} disabled={Boolean(saving)} onadd={addFiles} />
  </div>

  <aside class="grid min-w-0 gap-6 lg:sticky lg:top-20">
    <section class="grid gap-5 surface p-4" aria-label="Publishing">
      <ReleaseTarget bind:tagName bind:target {branches} {tags} {existingTag} {release} />
      <div class="grid gap-2">
        <span class="text-sm font-semibold text-ink-strong">Release type</span>
        <SegmentedControl bind:value={kind} options={kinds} label="Release type" />
        <span class="text-xs leading-relaxed text-ink-muted">{kindHints[kind]}</span>
      </div>
    </section>
    <div class="grid gap-2">
      {#if published}
        <Button type="submit" variant="primary" block loading={saving === 'publish'} disabled={blocked}
          >Save release</Button
        >
      {:else}
        <Button type="submit" variant="primary" block loading={saving === 'publish'} disabled={blocked}
          >Publish release</Button
        >
        <Button block loading={saving === 'draft'} disabled={blocked} onclick={() => save(false)}>Save draft</Button>
      {/if}
      <LinkButton
        variant="ghost"
        block
        href={release ? releasePath(owner, repository, release.tagName) : `/${owner}/${repository}/releases`}
        >Cancel</LinkButton
      >
    </div>
    {#if release}
      <div class="flex items-center justify-between gap-4 border-t border-line-subtle pt-5">
        <p class="text-xs text-ink-muted">The Git tag stays. Uploaded files are removed.</p>
        <Button size="small" variant="danger-soft" onclick={() => (confirmDelete = true)}>Delete</Button>
      </div>
    {/if}
  </aside>
</form>

{#if release}
  <ConfirmDialog
    open={confirmDelete}
    title="Delete release?"
    confirmLabel="Delete release"
    busy={deleting}
    {error}
    onConfirm={remove}
    onClose={() => (confirmDelete = false)}
  >
    <strong>{release.name || release.tagName}</strong> and its uploaded files will be removed. The Git tag stays.
  </ConfirmDialog>
{/if}
