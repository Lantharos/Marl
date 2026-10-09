<script lang="ts">
  import { goto } from '$app/navigation';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import Button from '#lib/components/controls/Button.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import RepositoryIcon from '#lib/components/identity/RepositoryIcon.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import BackLink from '#lib/components/page/BackLink.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import Page from '#lib/components/page/Page.svelte';
  import RepositoryPicker from '#lib/issues/new/RepositoryPicker.svelte';
  import { repositoryTemplate } from '#lib/repositories/templates.js';
  import { api, MarlApiError } from '#lib/api.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let repository = $derived(data.repository);
  let title = $state('');
  let body = $state('');
  let creating = $state(false);
  let uploading = $state(false);
  let error = $state('');
  let appliedTemplate = '';
  const known = $derived(data.repositories.find((item) => `${item.owner}/${item.name}` === repository));
  const choosable = $derived(Boolean(known) && data.repositories.length > 1);
  const parts = $derived.by(() => {
    const [owner, ...name] = repository.split('/');
    return { owner, name: name.join('/') };
  });
  const context = $derived(repository ? { owner: parts.owner, repository: parts.name } : undefined);
  const ready = $derived(Boolean(repository) && title.trim().length >= 3 && !uploading);

  $effect(() => {
    const current = repository;
    if (!current) return;
    void repositoryTemplate(current, 'issue').then((template) => {
      if (current !== repository || (body.trim() && body !== appliedTemplate)) return;
      body = template ?? '';
      appliedTemplate = body;
    });
  });

  async function create() {
    if (creating || !ready) return;
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
<Page class="[--page-width:984px]">
  <BackLink href={repository ? `/${parts.owner}/${parts.name}/issues` : '/issues'} label="Issues" />
  {#if !repository}
    <EmptyState
      class="mt-10"
      icon={FolderGit2}
      title="No repositories yet"
      description="Create a repository before opening an issue."
    >
      <LinkButton size="small" variant="primary" href="/repositories/new">Create repository</LinkButton>
    </EmptyState>
  {:else}
    <form
      class="mt-5 grid gap-4 [html:has(&)]:scroll-pb-20"
      onsubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <h1 class="sr-only">New issue</h1>
      <div class="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
        <span>New issue in</span>
        {#if choosable}<RepositoryPicker bind:value={repository} repositories={data.repositories} />{:else}<span
            class="inline-flex min-w-0 items-center gap-2 font-semibold text-ink-strong"
            ><RepositoryIcon name={parts.name} src={known?.iconUrl} size={22} /><span class="truncate"
              >{repository}</span
            ></span
          >{/if}
      </div>
      {#if error}<Notice>{error}</Notice>{/if}
      <input
        bind:value={title}
        {@attach (node) => node.focus()}
        class="w-full bg-transparent py-1 text-2xl leading-tight font-semibold tracking-tight text-ink-strong placeholder:text-ink-faint sm:text-3xl"
        aria-label="Title"
        placeholder="Title"
        maxlength="240"
        required
      />
      <MarkdownComposer
        bind:uploading
        bind:value={body}
        {context}
        grow
        minHeight="max(280px, 52vh)"
        placeholder="Describe what happened, how to reproduce it, or what done looks like."
        onsubmit={create}
      />
      <footer
        class="sticky bottom-0 z-1 -mx-1 flex flex-wrap items-center justify-end gap-2 bg-canvas/90 px-1 py-3 backdrop-blur-lg"
      >
        <span class="mr-auto flex items-center gap-1 text-xs text-ink-faint max-sm:hidden"
          ><Kbd>Ctrl</Kbd><Kbd>Enter</Kbd> to open</span
        >
        <LinkButton variant="ghost" href={`/${parts.owner}/${parts.name}/issues`}>Cancel</LinkButton>
        <Button type="submit" variant="primary" loading={creating} disabled={!ready}>Open issue</Button>
      </footer>
    </form>
  {/if}
</Page>
