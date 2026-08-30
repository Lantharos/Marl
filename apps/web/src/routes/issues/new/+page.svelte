<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import Button from '$lib/components/Button.svelte';
  import FormShell from '$lib/components/FormShell.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let repository = $state(untrack(() => data.repository));
  let title = $state('');
  let body = $state('');
  let creating = $state(false);
  let error = $state('');
  const options = $derived(data.repositories.map((item: RepositorySummary) => ({ value: `${item.owner}/${item.name}`, label: `${item.owner}/${item.name}`, description: item.description })));
  const parts = $derived.by(() => { const [owner, ...name] = repository.split('/'); return { owner, name: name.join('/') }; });
  const context = $derived(repository ? { owner: parts.owner, repository: parts.name } : undefined);
  async function create() { if (creating || title.trim().length < 3 || !repository) return; creating = true; error = ''; try { const result = await api<{ issue: { number: number } }>(`/repositories/${parts.owner}/${parts.name}/issues`, { method: 'POST', body: JSON.stringify({ title, body }) }); await goto(`/${parts.owner}/${parts.name}/issues/${result.issue.number}`); } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Issue could not be created.'; creating = false; } }
</script>

<svelte:head><title>New issue · Marl</title></svelte:head>
<FormShell title="Open an issue" description="Describe a bug, proposal, or piece of work clearly enough to move it forward.">
  {#if error}<div class="error" role="alert"><CircleAlert size={15} />{error}</div>{/if}
  {#if !data.repositories.length && !data.repositoryFixed}<div class="empty"><strong>No repositories yet</strong><p>Create a repository before opening an issue.</p><a href="/repositories/new">Create repository</a></div>{:else}<form class="form-grid" onsubmit={(event) => { event.preventDefault(); create(); }}>{#if !data.repositoryFixed}<label class="field"><span>Repository</span><Select bind:value={repository} options={options} ariaLabel="Repository" /></label>{/if}<label class="field"><span>Title</span><input bind:value={title} maxlength="240" required placeholder="What needs attention?" /></label><div class="field"><span>Description</span><MarkdownComposer bind:value={body} {context} placeholder="Add context, reproduction steps, or acceptance criteria." minHeight={180} /></div><div class="form-actions"><a href={repository ? `/${parts.owner}/${parts.name}/issues` : '/issues'}>Cancel</a><Button type="submit" variant="primary" loading={creating} disabled={!repository || title.trim().length < 3}>Open issue</Button></div></form>{/if}
</FormShell>
<style>.error{display:flex;align-items:center;gap:7px;padding:10px 11px;border-left:2px solid var(--danger);background:var(--danger-soft);color:var(--danger);font-size:10px}.empty{padding:48px 20px;text-align:center}.empty strong{color:var(--text-strong);font-size:12px}.empty p{color:var(--text-faint);font-size:10px}.empty a{color:var(--brand);font-size:10px}</style>
