<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import type { ReleaseDetail, RepositoryTag } from '@marl/contracts';
  import FileArchive from '@lucide/svelte/icons/file-archive';
  import Trash2 from '@lucide/svelte/icons/trash';
  import Upload from '@lucide/svelte/icons/upload';
  import Tag from '@lucide/svelte/icons/tag';
  import BackLink from '$lib/components/page/BackLink.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import ConfirmDialog from '$lib/components/overlays/ConfirmDialog.svelte';
  import Checkbox from '$lib/components/controls/Checkbox.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import ReleaseAssets from './ReleaseAssets.svelte';
  import TagPicker from './TagPicker.svelte';
  import { releasePath } from './release-path';
  import { uploadReleaseAsset } from './release-upload';

  type Branch = { name: string; commitId: string };
  let {
    owner,
    repository,
    branches,
    tags,
    release
  }: { owner: string; repository: string; branches: Branch[]; tags: RepositoryTag[]; release?: ReleaseDetail } =
    $props();
  let tagName = $state(untrack(() => release?.tagName ?? ''));
  let target = $state(untrack(() => release?.targetBranch ?? release?.targetCommitId ?? branches[0]?.name ?? ''));
  let name = $state(untrack(() => release?.name ?? ''));
  let body = $state(untrack(() => release?.body ?? ''));
  let draft = $state(untrack(() => release?.draft ?? false));
  let prerelease = $state(untrack(() => release?.prerelease ?? false));
  let makeLatest = $state(untrack(() => release?.latest ?? true));
  let assets = $state(untrack(() => release?.assets ?? []));
  let pendingFiles = $state<File[]>([]);
  let fileInput = $state<HTMLInputElement>();
  let saving = $state(false);
  let notesUploading = $state(false);
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let error = $state(
    untrack(() =>
      page.url.searchParams.get('upload') === 'failed'
        ? 'The release was kept as a draft because one or more files could not be uploaded.'
        : page.url.searchParams.get('publish') === 'failed'
          ? 'The files were uploaded, but the Git tag could not be published. The release remains a draft.'
          : ''
    )
  );
  const published = $derived(Boolean(release && !release.draft));
  const targetOptions = $derived.by(() => {
    const options = branches.map((branch) => ({
      value: branch.name,
      label: branch.name,
      description: branch.commitId.slice(0, 8)
    }));
    if (target && !options.some((option) => option.value === target))
      options.unshift({ value: target, label: `Commit ${target.slice(0, 8)}`, description: 'Tag target' });
    return options;
  });
  const context = $derived({ owner, repository });

  function chooseTag(tag: RepositoryTag) {
    target = tag.targetCommitId;
  }

  async function save() {
    if (saving || notesUploading || !tagName.trim() || !target) return;
    saving = true;
    error = '';
    try {
      const payload = published
        ? { name: name.trim(), body, prerelease, makeLatest }
        : {
            tagName: tagName.trim(),
            target,
            name: name.trim(),
            body,
            draft: release ? draft : pendingFiles.length ? true : draft,
            prerelease,
            makeLatest: release || !pendingFiles.length ? makeLatest : false
          };
      const result = release
        ? await api<{ release: { id: string; tagName: string } }>(
            `/repositories/${owner}/${repository}/releases/${release.id}`,
            { method: 'PATCH', body: JSON.stringify(payload) }
          )
        : await api<{ release: { id: string; tagName: string } }>(`/repositories/${owner}/${repository}/releases`, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
      if (!release && pendingFiles.length) {
        try {
          for (const file of pendingFiles) await uploadReleaseAsset(owner, repository, result.release.id, file);
        } catch {
          await goto(`/${owner}/${repository}/releases/edit/${result.release.id}?upload=failed`);
          return;
        }
        if (!draft) {
          try {
            await api(`/repositories/${owner}/${repository}/releases/${result.release.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                tagName: tagName.trim(),
                target,
                name: name.trim(),
                body,
                draft: false,
                prerelease,
                makeLatest
              })
            });
          } catch {
            await goto(`/${owner}/${repository}/releases/edit/${result.release.id}?publish=failed`);
            return;
          }
        }
      }
      await goto(releasePath(owner, repository, result.release.tagName));
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The release could not be saved.';
      saving = false;
    }
  }

  function chooseFiles(event: Event) {
    const chosen = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    const names = new Set(pendingFiles.map((file) => file.name));
    pendingFiles = [...pendingFiles, ...chosen.filter((file) => file.size > 0 && !names.has(file.name))].slice(0, 32);
    if (fileInput) fileInput.value = '';
  }

  function fileSize(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
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

<main class="mx-auto w-full max-w-290 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
  <header class="mb-6">
    <BackLink href="/{owner}/{repository}/releases" label="Releases" />
    <h1 class="mt-4 flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-ink-strong">
      <Tag size={22} class="text-brand" />{release ? 'Edit release' : 'New release'}
    </h1>
  </header>
  {#if error}<Notice class="mb-5">{error}</Notice>{/if}
  <form
    class="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6"
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    <div class="grid gap-5 surface p-5 lg:col-start-1 lg:row-start-1 lg:p-6">
      <Field label="Tag">
        {#if published}<div
            class="flex h-10 items-center gap-2 rounded-md bg-surface-muted px-3 font-mono text-sm text-ink-muted"
          >
            <Tag size={14} />{tagName}
          </div>{:else}<TagPicker bind:value={tagName} {tags} onchoose={chooseTag} />{/if}
      </Field>
      <Field label="Target">
        {#if published}<div
            class="flex h-10 items-center rounded-md bg-surface-muted px-3 font-mono text-sm text-ink-muted"
          >
            {release?.targetBranch ?? release?.targetCommitId.slice(0, 12)}
          </div>{:else}<Select bind:value={target} options={targetOptions} ariaLabel="Release target" />{/if}
      </Field>
      <Field label="Release title">
        <input
          class="field"
          bind:value={name}
          maxlength="240"
          placeholder={tagName || 'Release title'}
          data-1p-ignore
        />
      </Field>
    </div>
    <div class="grid gap-6 surface p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:p-6">
      <div class="grid gap-2">
        <span class="text-sm font-semibold text-ink-strong">Release notes</span>
        <MarkdownComposer
          bind:value={body}
          bind:uploading={notesUploading}
          {context}
          disabled={saving || deleting}
          placeholder="What changed in this release?"
          minHeight={240}
        />
      </div>
      {#if !release}
        <section>
          <header class="mb-2 flex items-center justify-between gap-4">
            <strong class="text-sm font-semibold text-ink-strong">Downloads</strong>
            <Button size="small" onclick={() => fileInput?.click()}><Upload size={14} />Add files</Button>
            <input bind:this={fileInput} class="hidden" type="file" multiple onchange={chooseFiles} />
          </header>
          {#each pendingFiles as file (file.name)}
            <div
              class="grid min-h-11 grid-cols-[20px_minmax(0,1fr)_auto_32px] items-center gap-2 text-sm text-ink-muted"
            >
              <FileArchive size={16} /><span class="truncate text-ink">{file.name}</span><span class="text-xs"
                >{fileSize(file.size)}</span
              ><Button
                icon
                size="small"
                variant="ghost"
                aria-label={`Remove ${file.name}`}
                onclick={() => (pendingFiles = pendingFiles.filter((item) => item !== file))}
                ><Trash2 size={14} /></Button
              >
            </div>
          {:else}<p class="py-3 text-sm text-ink-muted">No files attached.</p>{/each}
        </section>
      {/if}
    </div>
    <div class="grid gap-1 surface p-2 lg:col-start-1 lg:row-start-2">
      <Checkbox
        bind:checked={draft}
        disabled={published}
        onchange={(checked) => {
          if (checked) makeLatest = false;
        }}
        label="Save as draft"
        description="Only repository collaborators can see drafts."
      />
      <Checkbox
        bind:checked={prerelease}
        onchange={(checked) => {
          if (checked) makeLatest = false;
        }}
        label="Mark as prerelease"
        description="Use this for preview, beta, and release-candidate builds."
      />
      <Checkbox
        bind:checked={makeLatest}
        disabled={draft || prerelease}
        label="Set as latest release"
        description="Feature this release as the recommended version."
      />
    </div>
    <div class="flex justify-end gap-2 lg:col-span-2">
      <LinkButton
        variant="ghost"
        href={release ? releasePath(owner, repository, release.tagName) : `/${owner}/${repository}/releases`}
        >Cancel</LinkButton
      >
      <Button type="submit" variant="primary" loading={saving} disabled={notesUploading || !tagName.trim() || !target}
        >{draft ? 'Save draft' : release ? 'Save release' : 'Publish release'}</Button
      >
    </div>
  </form>
  {#if release}
    <div class="mt-8"><ReleaseAssets {owner} {repository} releaseId={release.id} bind:assets editable /></div>
    <section class="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line-subtle pt-6">
      <div>
        <strong class="block text-base font-semibold text-ink-strong">Delete this release</strong>
        <p class="mt-1 text-sm text-ink-muted">
          The Git tag stays in the repository. Attached assets are permanently removed.
        </p>
      </div>
      <Button size="small" variant="danger-soft" onclick={() => (confirmDelete = true)}>Delete release</Button>
    </section>
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
</main>
