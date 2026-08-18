<script lang="ts">
  import { page } from '$app/stores';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Code2 from 'lucide-svelte/icons/code-2';
  import Copy from 'lucide-svelte/icons/copy';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import Lock from 'lucide-svelte/icons/lock';
  import PlayCircle from 'lucide-svelte/icons/play-circle';
  import Settings from 'lucide-svelte/icons/settings';
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
  const cloneUrl = $derived(repository?.cloneUrl ?? '');

  async function copyCloneUrl() { if (!cloneUrl) return; await navigator.clipboard.writeText(cloneUrl); copied = true; setTimeout(() => (copied = false), 1600); }
  function tabActive(tab: string) { if (tab === 'code') return path === base || path.startsWith(`${base}/tree`) || path.startsWith(`${base}/blob`) || path.startsWith(`${base}/commit`) || path.startsWith(`${base}/branches`); return path.startsWith(`${base}/${tab}`); }
</script>

<section class="repo-bar">
  <div class="repo-line">
    <div class="identity"><div class="crumb"><a href="/repositories">{owner}</a><span>/</span><a href={base}>{repo}</a>{#if repository?.visibility === 'private'}<span class="private"><Lock size={11} />Private</span>{/if}</div>{#if repository?.description}<p>{repository.description}</p>{/if}</div>
    <div class="clone-anchor" use:dismissable={() => (cloneOpen = false)}><button class="clone-button" aria-expanded={cloneOpen} onclick={() => (cloneOpen = !cloneOpen)}><Code2 size={14} /><span>Clone</span><ChevronDown size={12} /></button>{#if cloneOpen}<div class="clone-menu"><strong>Clone this repository</strong><p>HTTPS works with Git and your Marl access token.</p><div><code>{cloneUrl}</code><button aria-label="Copy clone URL" onclick={copyCloneUrl}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</button></div></div>{/if}</div>
  </div>
  <nav aria-label="Repository"><a class:active={tabActive('code')} href={base}><Code2 size={14} />Code</a><a class:active={tabActive('pulls')} href="{base}/pulls"><GitPullRequest size={14} />Pull requests</a><a class:active={tabActive('runs')} href="{base}/runs"><PlayCircle size={14} />Runs</a><a class:active={tabActive('settings')} href="{base}/settings"><Settings size={14} />Settings</a></nav>
</section>

<div class="repository-content">{@render children()}</div>

<style>
  .repo-bar{border-bottom:1px solid var(--border-subtle);background:var(--surface)}.repo-line{display:flex;width:min(1240px,calc(100% - 48px));min-height:61px;margin:0 auto;align-items:center;justify-content:space-between;gap:20px}.identity{min-width:0}.crumb{display:flex;align-items:center;gap:6px}.crumb>a{color:var(--text-strong);font-size:14px;font-weight:640;text-decoration:none}.crumb>a:first-child{color:var(--text-muted);font-weight:520}.crumb>span:not(.private){color:var(--text-faint)}.private{display:inline-flex;align-items:center;gap:4px;margin-left:5px;color:var(--text-faint);font-size:9px}.identity p{overflow:hidden;margin:4px 0 0;color:var(--text-faint);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.clone-anchor{position:relative}.clone-button{display:inline-flex;height:30px;align-items:center;gap:5px;padding:0 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-raised);color:var(--text);cursor:pointer;font-size:10px;font-weight:600}.clone-button:hover{border-color:var(--border-strong);background:var(--surface-muted)}.clone-menu{position:absolute;top:36px;right:0;z-index:30;width:330px;padding:12px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.clone-menu>strong{color:var(--text-strong);font-size:11px}.clone-menu>p{margin:4px 0 10px;color:var(--text-faint);font-size:9px}.clone-menu>div{display:grid;grid-template-columns:minmax(0,1fr)30px;border:1px solid var(--border);border-radius:5px;background:var(--surface)}.clone-menu code{overflow:hidden;padding:8px;color:var(--text-muted);font-size:9px;text-overflow:ellipsis;white-space:nowrap}.clone-menu div button{display:grid;width:30px;border:0;border-left:1px solid var(--border);background:transparent;color:var(--text-muted);place-items:center;cursor:pointer}.repo-bar nav{display:flex;width:min(1240px,calc(100% - 48px));height:36px;margin:0 auto;gap:3px}.repo-bar nav a{position:relative;display:inline-flex;align-items:center;gap:6px;padding:0 9px;color:var(--text-muted);font-size:10px;font-weight:580;text-decoration:none}.repo-bar nav a:hover,.repo-bar nav a.active{color:var(--text-strong)}.repo-bar nav a.active::after{position:absolute;inset:auto 8px -1px;height:2px;background:var(--brand);content:''}.repository-content{width:min(1240px,calc(100% - 48px));margin:0 auto;padding:25px 0 72px}
  @media(max-width:680px){.repo-line,.repo-bar nav,.repository-content{width:calc(100% - 28px)}.repo-line{min-height:57px}.identity p,.clone-button span,.clone-button :global(svg:last-child){display:none}.clone-button{width:30px;padding:0;justify-content:center}.repo-bar nav{overflow-x:auto}.repo-bar nav a{flex:0 0 auto}.repository-content{padding-top:18px}}
</style>
