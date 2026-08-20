<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Code2 from 'lucide-svelte/icons/code-2';
  import Copy from 'lucide-svelte/icons/copy';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitFork from 'lucide-svelte/icons/git-fork';
  import Lock from 'lucide-svelte/icons/lock';
  import PlayCircle from 'lucide-svelte/icons/play-circle';
  import Settings from 'lucide-svelte/icons/settings';
  import Star from 'lucide-svelte/icons/star';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Select from '$lib/components/Select.svelte';
  import { dismissable } from '$lib/actions/dismissable';

  import type { LayoutData } from './$types';

  let { children, data } = $props<{ children: import('svelte').Snippet; data: LayoutData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const base = $derived(`/${owner}/${repo}`);
  const path = $derived($page.url.pathname);
  const repository = $derived(data.repository);
  let cloneOpen = $state(false);
  let copied = $state(false);
  let cloneProtocol = $state<'https' | 'ssh'>('https');
  let starred = $state(untrack(() => Boolean(data.repository?.starred)));
  let starCount = $state(untrack(() => data.repository?.starCount ?? 0));
  let starring = $state(false);
  let forkOpen = $state(false);
  let forking = $state(false);
  let forkOwner = $state(untrack(() => data.shellOrganizations?.[0]?.slug ?? ''));
  let forkName = $state($page.params.repo ?? '');
  let forkError = $state('');
  const cloneUrl = $derived(cloneProtocol === 'ssh' ? repository?.sshCloneUrl ?? '' : repository?.cloneUrl ?? '');
  const organizationOptions = $derived((data.shellOrganizations ?? []).filter((organization: { role: string }) => organization.role !== 'member').map((organization: { slug: string; name: string }) => ({ value: organization.slug, label: organization.slug, description: organization.name })));

  async function copyCloneUrl() { if (!cloneUrl) return; await navigator.clipboard.writeText(cloneUrl); copied = true; setTimeout(() => (copied = false), 1600); }
  async function toggleStar() {
    if (starring) return;
    starring = true;
    try { const result = await api<{ starred: boolean; starCount: number }>(`/repositories/${owner}/${repo}/star`, { method: starred ? 'DELETE' : 'PUT' }); starred = result.starred; starCount = result.starCount; }
    finally { starring = false; }
  }
  async function createFork() {
    if (forking || !forkOwner || !forkName.trim()) return;
    forking = true; forkError = '';
    try { const result = await api<{ repository: { owner: string; name: string } }>(`/repositories/${owner}/${repo}/forks`, { method: 'POST', body: JSON.stringify({ owner: forkOwner, name: forkName }) }); await goto(`/${result.repository.owner}/${result.repository.name}`); }
    catch (cause) { forkError = cause instanceof MarlApiError ? cause.message : 'Repository could not be forked.'; forking = false; }
  }
  function tabActive(tab: string) {
    if (tab === 'overview') return path === base;
    if (tab === 'code') return path === `${base}/code` || path.startsWith(`${base}/tree`) || path.startsWith(`${base}/blob`) || path.startsWith(`${base}/commit`) || path.startsWith(`${base}/branches`);
    return path.startsWith(`${base}/${tab}`);
  }
</script>

<section class="repo-bar">
  <div class="repo-line">
    <div class="identity"><div class="crumb"><a href="/{owner}">{owner}</a><span>/</span><a href={base}>{repo}</a>{#if repository?.visibility === 'private'}<span class="private"><Lock size={11} />Private</span>{/if}</div>{#if repository?.upstream}<p class="upstream"><GitFork size={11} />Forked from <a href="/{repository.upstream.owner}/{repository.upstream.name}">{repository.upstream.owner}/{repository.upstream.name}</a></p>{:else if repository?.description}<p>{repository.description}</p>{/if}</div>
    <div class="repo-actions"><Button size="small" loading={starring} aria-label={starred ? 'Unstar repository' : 'Star repository'} onclick={toggleStar}><Star size={14} fill={starred ? 'currentColor' : 'none'} />Star{#if starCount}<span class="count">{starCount}</span>{/if}</Button><Button size="small" disabled={!organizationOptions.length} onclick={() => { forkOwner = organizationOptions[0]?.value ?? ''; forkName = repo; forkError = ''; forkOpen = true; }}><GitFork size={14} />Fork{#if repository?.forkCount}<span class="count">{repository.forkCount}</span>{/if}</Button><div class="clone-anchor" use:dismissable={() => (cloneOpen = false)}><Button size="small" aria-expanded={cloneOpen} onclick={() => (cloneOpen = !cloneOpen)}><Code2 size={14} /><span>Clone</span><ChevronDown size={12} /></Button>{#if cloneOpen}<div class="clone-menu"><strong>Clone this repository</strong>{#if repository?.sshCloneUrl}<div class="protocols"><button class:active={cloneProtocol === 'https'} onclick={() => { cloneProtocol = 'https'; copied = false; }}>HTTPS</button><button class:active={cloneProtocol === 'ssh'} onclick={() => { cloneProtocol = 'ssh'; copied = false; }}>SSH</button></div>{/if}<p>{cloneProtocol === 'ssh' ? 'Authenticate with an SSH key from Developer access.' : 'Authenticate with a Marl developer token.'}</p><div class="clone-value"><code>{cloneUrl}</code><button aria-label="Copy clone URL" onclick={copyCloneUrl}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</button></div></div>{/if}</div></div>
  </div>
  <nav aria-label="Repository"><a class:active={tabActive('overview')} href={base}><BookOpen size={14} />Overview</a><a class:active={tabActive('code')} href="{base}/code"><Code2 size={14} />Code</a><a class:active={tabActive('pulls')} href="{base}/pulls"><GitPullRequest size={14} />Pull requests</a><a class:active={tabActive('runs')} href="{base}/runs"><PlayCircle size={14} />Runs</a><a class:active={tabActive('settings')} href="{base}/settings"><Settings size={14} />Settings</a></nav>
</section>

<div class="repository-content">{@render children()}</div>

<Modal open={forkOpen} title="Fork repository" description="Create an independent working copy connected to this repository's fork network." onClose={() => (forkOpen = false)}>
  {#snippet children()}<div class="fork-fields"><label><span>Owner</span><Select bind:value={forkOwner} options={organizationOptions} ariaLabel="Fork owner" /></label><label><span>Repository name</span><input bind:value={forkName} maxlength="100" /></label>{#if forkError}<p class="fork-error" role="alert">{forkError}</p>{/if}</div>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (forkOpen = false)}>Cancel</Button><Button size="small" variant="primary" loading={forking} disabled={!forkOwner || !forkName.trim()} onclick={createFork}>Create fork</Button>{/snippet}
</Modal>

<style>
  .repo-bar{border-bottom:1px solid var(--border-subtle);background:var(--surface)}.repo-line{display:flex;width:min(1240px,calc(100% - 48px));min-height:64px;margin:0 auto;align-items:center;justify-content:space-between;gap:20px}.identity{min-width:0}.crumb{display:flex;align-items:center;gap:6px}.crumb>a{color:var(--text-strong);font-size:15px;font-weight:640;text-decoration:none}.crumb>a:first-child{color:var(--text-muted);font-weight:520}.crumb>span:not(.private){color:var(--text-faint)}.private{display:inline-flex;align-items:center;gap:4px;margin-left:5px;color:var(--text-faint);font-size:11px}.identity p{overflow:hidden;margin:5px 0 0;color:var(--text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.clone-anchor{position:relative}.clone-menu{position:absolute;top:40px;right:0;z-index:30;width:360px;padding:14px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.clone-menu>strong{color:var(--text-strong);font-size:13px}.clone-menu>p{margin:8px 0 11px;color:var(--text-muted);font-size:11px}.protocols{display:flex!important;grid-template-columns:none!important;gap:2px;margin-top:10px;border:0!important;background:transparent!important}.protocols button{width:auto!important;height:28px;padding:0 9px;border:0!important;border-radius:5px;background:transparent!important;color:var(--text-muted);font-size:11px;font-weight:620;cursor:pointer}.protocols button.active{background:var(--brand-soft)!important;color:var(--text-strong)}.clone-value{display:grid;grid-template-columns:minmax(0,1fr)34px;border:1px solid var(--border);border-radius:5px;background:var(--surface)}.clone-menu code{overflow:hidden;padding:9px;color:var(--text);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.clone-value button{display:grid;width:34px;border:0;border-left:1px solid var(--border);background:transparent;color:var(--text-muted);place-items:center;cursor:pointer}.repo-bar nav{display:flex;width:min(1240px,calc(100% - 48px));height:40px;margin:0 auto;gap:3px}.repo-bar nav a{position:relative;display:inline-flex;align-items:center;gap:6px;padding:0 10px;color:var(--text-muted);font-size:12px;font-weight:580;text-decoration:none}.repo-bar nav a:hover,.repo-bar nav a.active{color:var(--text-strong)}.repo-bar nav a.active::after{position:absolute;inset:auto 8px -1px;height:2px;background:var(--brand);content:''}.repository-content{width:min(1240px,calc(100% - 48px));margin:0 auto;padding:27px 0 72px}
  .repo-actions{display:flex;align-items:center;gap:7px}.count{padding-left:6px;border-left:1px solid var(--border);color:var(--text-faint)}.upstream{display:flex;align-items:center;gap:5px}.upstream a{color:var(--text-muted);text-decoration:none}.upstream a:hover{color:var(--brand)}.fork-fields{display:grid;gap:14px}.fork-fields label{display:grid;gap:7px}.fork-fields label>span{color:var(--text-muted);font-size:11px;font-weight:620}.fork-fields input{width:100%;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:12px}.fork-fields input:focus{border-color:var(--brand)}.fork-error{margin:0;color:var(--danger);font-size:11px}
  @media(max-width:680px){.repo-line,.repo-bar nav,.repository-content{width:calc(100% - 28px)}.repo-line{min-height:57px}.identity p,.repo-actions :global(.button span){display:none}.repo-actions{gap:4px}.repo-bar nav{overflow-x:auto}.repo-bar nav a{flex:0 0 auto}.repository-content{padding-top:18px}}
</style>
