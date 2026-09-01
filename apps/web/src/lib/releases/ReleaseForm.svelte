<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { ReleaseDetail, RepositoryTag } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import Tag from 'lucide-svelte/icons/tag';
  import BackLink from '$lib/components/BackLink.svelte';
  import Button from '$lib/components/Button.svelte';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import ReleaseAssets from './ReleaseAssets.svelte';
  import TagPicker from './TagPicker.svelte';
  import { releasePath } from './release-path';

  type Branch = { name: string; commitId: string };
  let { owner, repository, branches, tags, release }: { owner: string; repository: string; branches: Branch[]; tags: RepositoryTag[]; release?: ReleaseDetail } = $props();
  let tagName = $state(untrack(() => release?.tagName ?? ''));
  let target = $state(untrack(() => release?.targetBranch ?? release?.targetCommitId ?? branches[0]?.name ?? ''));
  let name = $state(untrack(() => release?.name ?? ''));
  let body = $state(untrack(() => release?.body ?? ''));
  let draft = $state(untrack(() => release?.draft ?? false));
  let prerelease = $state(untrack(() => release?.prerelease ?? false));
  let makeLatest = $state(untrack(() => release?.latest ?? true));
  let assets = $state(untrack(() => release?.assets ?? []));
  let saving = $state(false);
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let error = $state('');
  const published = $derived(Boolean(release && !release.draft));
  const targetOptions = $derived.by(() => {
    const options = branches.map((branch) => ({ value: branch.name, label: branch.name, description: branch.commitId.slice(0, 8) }));
    if (target && !options.some((option) => option.value === target)) options.unshift({ value: target, label: `Commit ${target.slice(0, 8)}`, description: 'Tag target' });
    return options;
  });
  const context = $derived({ owner, repository });

  function chooseTag(tag: RepositoryTag) {
    target = tag.targetCommitId;
  }

  async function save() {
    if (saving || !tagName.trim() || !target) return;
    saving = true;
    error = '';
    try {
      const payload = published
        ? { name: name.trim(), body, prerelease, makeLatest }
        : { tagName: tagName.trim(), target, name: name.trim(), body, draft, prerelease, makeLatest };
      const result = release
        ? await api<{ release: { tagName: string } }>(`/repositories/${owner}/${repository}/releases/${release.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api<{ release: { tagName: string } }>(`/repositories/${owner}/${repository}/releases`, { method: 'POST', body: JSON.stringify(payload) });
      await goto(releasePath(owner, repository, result.release.tagName));
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The release could not be saved.';
      saving = false;
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

<main class="page">
  <header><BackLink href="/{owner}/{repository}/releases" label="Releases" /><div><Tag size={20} /><h1>{release ? 'Edit release' : 'New release'}</h1></div><p>{release ? 'Update the notes, status, and downloadable files for this release.' : 'Publish a tagged version with notes and downloadable files.'}</p></header>
  {#if error}<div class="error" role="alert"><CircleAlert size={15} />{error}</div>{/if}
  <form onsubmit={(event) => { event.preventDefault(); save(); }}>
    <div class="field-row">
      <label class="field"><span>Tag</span>{#if published}<div class="fixed"><Tag size={13} />{tagName}</div>{:else}<TagPicker bind:value={tagName} {tags} onchoose={chooseTag} />{/if}<small>Choose an existing tag or enter a new one.</small></label>
      <label class="field"><span>Target</span>{#if published}<div class="fixed"><code>{release?.targetBranch ?? release?.targetCommitId.slice(0, 12)}</code></div>{:else}<Select bind:value={target} options={targetOptions} ariaLabel="Release target" />{/if}<small>New tags point to this branch or commit.</small></label>
    </div>
    <label class="field"><span>Release title</span><input bind:value={name} maxlength="240" placeholder={tagName || 'Release title'} /></label>
    <div class="field"><span>Release notes</span><MarkdownComposer bind:value={body} {context} placeholder="What changed in this release?" minHeight={220} /></div>
    <div class="options"><Checkbox bind:checked={draft} disabled={published} onchange={(checked) => { if (checked) makeLatest = false; }} label="Save as draft" description="Only repository collaborators can see drafts." /><Checkbox bind:checked={prerelease} onchange={(checked) => { if (checked) makeLatest = false; }} label="Mark as prerelease" description="Use this for preview, beta, and release-candidate builds." /><Checkbox bind:checked={makeLatest} disabled={draft || prerelease} label="Set as latest release" description="Feature this release as the recommended version." /></div>
    <div class="actions"><a href={release ? releasePath(owner, repository, release.tagName) : `/${owner}/${repository}/releases`}>Cancel</a><Button type="submit" variant="primary" loading={saving} disabled={!tagName.trim() || !target}>{draft ? 'Save draft' : release ? 'Save release' : 'Publish release'}</Button></div>
  </form>
  {#if release}<ReleaseAssets {owner} {repository} releaseId={release.id} bind:assets editable />
    <section class="danger"><div><strong>Delete this release</strong><p>The Git tag stays in the repository. Attached assets are permanently removed.</p></div>{#if confirmDelete}<div class="confirm"><Button size="small" variant="ghost" onclick={() => (confirmDelete = false)}>Cancel</Button><Button size="small" variant="danger" loading={deleting} onclick={remove}>Delete release</Button></div>{:else}<Button size="small" variant="danger-soft" onclick={() => (confirmDelete = true)}>Delete</Button>{/if}</section>
  {/if}
</main>

<style>
  .page{width:min(820px,100%);margin:0 auto}.page>header{margin-bottom:26px}.page>header>div{display:flex;align-items:center;gap:9px;margin-top:19px;color:var(--brand)}h1{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.035em}.page>header p{margin:7px 0 0;color:var(--text-muted);font-size:12px}.error{display:flex;align-items:center;gap:7px;margin-bottom:18px;padding:10px 11px;border-left:2px solid var(--danger);background:var(--danger-soft);color:var(--danger);font-size:11px}form{display:grid;gap:19px;padding:24px 0;border-top:1px solid var(--border-subtle)}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{display:grid;gap:7px}.field>span{color:var(--text-strong);font-size:12px;font-weight:620}.field>small{color:var(--text-faint);font-size:9px}.field>input{height:38px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:13px}.field>input:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}.fixed{display:flex;height:38px;align-items:center;gap:7px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--surface-muted);color:var(--text-muted);font-size:12px}.fixed code{font-size:11px}.options{display:grid}.options :global(.checkbox+.checkbox){border-top:0}.actions{display:flex;justify-content:flex-end;gap:7px;padding-top:18px;border-top:1px solid var(--border-subtle)}.actions>a{display:inline-flex;height:36px;align-items:center;padding:0 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px;font-weight:630;text-decoration:none}.danger{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:28px;padding:22px 0;border-top:1px solid var(--border-subtle)}.danger strong{color:var(--text-strong);font-size:12px}.danger p{margin:4px 0 0;color:var(--text-faint);font-size:10px}.confirm{display:flex;gap:6px}@media(max-width:700px){.field-row{grid-template-columns:1fr}.danger{align-items:flex-start;flex-direction:column}}
</style>
