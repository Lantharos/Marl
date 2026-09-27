<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import FormShell from '$lib/components/page/FormShell.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let repository = $state(untrack(() => data.repository));
  let title = $state('');
  let body = $state('');
  let creating = $state(false);
  let uploading = $state(false);
  let error = $state('');
  const options = $derived(
    data.repositories.map((item: RepositorySummary) => ({
      value: `${item.owner}/${item.name}`,
      label: `${item.owner}/${item.name}`,
      description: item.description
    }))
  );
  const parts = $derived.by(() => {
    const [owner, ...name] = repository.split('/');
    return { owner, name: name.join('/') };
  });
  const context = $derived(repository ? { owner: parts.owner, repository: parts.name } : undefined);
  async function create() {
    if (creating || uploading || title.trim().length < 3 || !repository) return;
    creating = true;
    error = '';
    try {
      const result = await api<{ issue: { number: number } }>(`/repositories/${parts.owner}/${parts.name}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title, body })
      });
      await goto(`/${parts.owner}/${parts.name}/issues/${result.issue.number}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Issue could not be created.';
      creating = false;
    }
  }
</script>

<svelte:head><title>New issue · Marl</title></svelte:head>
<FormShell title="Open an issue" backHref="/issues" backLabel="Issues">
  {#if error}<Notice class="mb-5">{error}</Notice>{/if}
  {#if !data.repositories.length && !data.repositoryFixed}
    <EmptyState
      compact
      icon={FolderGit2}
      title="No repositories yet"
      description="Create a repository before opening an issue."
    >
      <LinkButton size="small" variant="primary" href="/repositories/new">Create repository</LinkButton>
    </EmptyState>
  {:else}
    <form
      class="grid gap-6"
      onsubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      {#if !data.repositoryFixed}<Field label="Repository"
          ><Select bind:value={repository} {options} ariaLabel="Repository" /></Field
        >{/if}
      <Field label="Title"
        ><input class="field" bind:value={title} maxlength="240" required placeholder="What needs attention?" /></Field
      >
      <div class="grid gap-2">
        <span class="text-sm font-semibold text-ink-strong">Description</span>
        <MarkdownComposer
          bind:uploading
          bind:value={body}
          {context}
          placeholder="Add context, reproduction steps, or acceptance criteria."
          minHeight={180}
        />
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <LinkButton variant="ghost" href={repository ? `/${parts.owner}/${parts.name}/issues` : '/issues'}
          >Cancel</LinkButton
        >
        <Button
          type="submit"
          variant="primary"
          loading={creating}
          disabled={uploading || !repository || title.trim().length < 3}>Open issue</Button
        >
      </div>
    </form>
  {/if}
</FormShell>
