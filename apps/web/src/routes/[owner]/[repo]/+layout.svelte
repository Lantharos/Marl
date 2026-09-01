<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onDestroy, tick, untrack } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Code2 from 'lucide-svelte/icons/code-2';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import Copy from 'lucide-svelte/icons/copy';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitFork from 'lucide-svelte/icons/git-fork';
  import Lock from 'lucide-svelte/icons/lock';
  import PlayCircle from 'lucide-svelte/icons/play-circle';
  import Settings from 'lucide-svelte/icons/settings';
  import Star from 'lucide-svelte/icons/star';
  import Tag from 'lucide-svelte/icons/tag';
  import { api, MarlApiError } from '$lib/api';
  import { completeRepositoryName, repositoryName, validRepositoryName } from '$lib/repository-name';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Select from '$lib/components/Select.svelte';
  import RepositoryIcon from '$lib/components/RepositoryIcon.svelte';
  import { dismissable } from '$lib/actions/dismissable';
  import { interfaceScale } from '$lib/ui/floating';

  import type { LayoutData } from './$types';

  let { children, data } = $props<{ children: import('svelte').Snippet; data: LayoutData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const base = $derived(`/${owner}/${repo}`);
  const path = $derived($page.url.pathname);
  const repository = $derived(data.repository);
  const canManageSettings = $derived(Boolean(repository?.permissions.maintain));
  let repositoryNav = $state<HTMLElement>();
  let islandX = $state(0);
  let islandWidth = $state(0);
  let islandStrokeWidth = $state(1);
  let islandReady = $state(false);
  let islandAnimation = 0;
  let islandTargetX = 0;
  let islandTargetWidth = 0;
  let cloneOpen = $state(false);
  let copied = $state(false);
  let cloneProtocol = $state<'https' | 'ssh'>('https');
  let starred = $state(untrack(() => Boolean(data.repository?.starred)));
  let starCount = $state(untrack(() => data.repository?.starCount ?? 0));
  let starring = $state(false);
  let forkOpen = $state(false);
  let forking = $state(false);
  let forkOwner = $state(untrack(() => data.shellOrganizations?.find((organization: { kind: string }) => organization.kind === 'personal')?.slug ?? ''));
  let forkName = $state($page.params.repo ?? '');
  let forkError = $state('');
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const submittedForkName = $derived(completeRepositoryName(forkName));
  const forkNameValid = $derived(validRepositoryName(submittedForkName));
  const cloneUrl = $derived(cloneProtocol === 'ssh' ? repository?.sshCloneUrl ?? '' : repository?.cloneUrl ?? '');
  const organizationOptions = $derived((data.shellOrganizations ?? [])
    .filter((organization: { role: string }) => organization.role !== 'member')
    .toSorted((left: { kind: string; name: string }, right: { kind: string; name: string }) => Number(right.kind === 'personal') - Number(left.kind === 'personal') || left.name.localeCompare(right.name))
    .map((organization: { slug: string; name: string; kind: string }) => ({ value: organization.slug, label: organization.kind === 'personal' ? data.shellUser.displayName : organization.name, description: organization.kind === 'personal' ? `@${organization.slug} · Personal account` : `@${organization.slug} · Organization` })));

  const islandBoundary = $derived(buildIslandBoundary(islandWidth, islandStrokeWidth));
  const islandFill = $derived(buildIslandFill(islandWidth, islandStrokeWidth));

  async function copyCloneUrl() { if (!cloneUrl) return; await navigator.clipboard.writeText(cloneUrl); copied = true; clearTimeout(copiedTimer); copiedTimer = setTimeout(() => (copied = false), 1600); }
  async function toggleStar() {
    if (starring) return;
    starring = true;
    const route = { owner, repo, base };
    try { const result = await api<{ starred: boolean; starCount: number }>(`/repositories/${route.owner}/${route.repo}/star`, { method: starred ? 'DELETE' : 'PUT' }); if (base === route.base) { starred = result.starred; starCount = result.starCount; } }
    finally { if (base === route.base) starring = false; }
  }
  async function createFork() {
    if (forking || !forkOwner || !forkNameValid) return;
    forking = true; forkError = '';
    try { const result = await api<{ repository: { owner: string; name: string } }>(`/repositories/${owner}/${repo}/forks`, { method: 'POST', body: JSON.stringify({ owner: forkOwner, name: submittedForkName }) }); await goto(`/${result.repository.owner}/${result.repository.name}`); }
    catch (cause) { forkError = cause instanceof MarlApiError ? cause.message : 'Repository could not be forked.'; forking = false; }
  }
  function tabActive(tab: string) {
    if (tab === 'overview') return path === base;
    if (tab === 'code') return path === `${base}/code` || path.startsWith(`${base}/tree`) || path.startsWith(`${base}/blob`) || path.startsWith(`${base}/commit`) || path.startsWith(`${base}/branches`);
    return path.startsWith(`${base}/${tab}`);
  }
  function buildIslandBoundary(width: number, strokeWidth: number) {
    const top = strokeWidth / 2;
    const rightCurve = Math.max(13, width - 13);
    const rightControl = Math.max(13, width - 5.8);
    return `M -8192 ${top} H -12 C -5.4 ${top} 0 5.4 0 12 V 29 C 0 36.2 5.8 42 13 42 H ${rightCurve} C ${rightControl} 42 ${width} 36.2 ${width} 29 V 12 C ${width} 5.4 ${width + 5.4} ${top} ${width + 12} ${top} H 8192`;
  }
  function buildIslandFill(width: number, strokeWidth: number) {
    const top = strokeWidth / 2;
    const rightCurve = Math.max(13, width - 13);
    const rightControl = Math.max(13, width - 5.8);
    return `M -12 ${top} C -5.4 ${top} 0 5.4 0 12 V 29 C 0 36.2 5.8 42 13 42 H ${rightCurve} C ${rightControl} 42 ${width} 36.2 ${width} 29 V 12 C ${width} 5.4 ${width + 5.4} ${top} ${width + 12} ${top} V -2 H -12 Z`;
  }
  function moveIsland(left: number, width: number, animate: boolean) {
    if (islandReady && animate && Math.abs(left - islandTargetX) < 0.01 && Math.abs(width - islandTargetWidth) < 0.01) return;
    islandTargetX = left;
    islandTargetWidth = width;
    cancelAnimationFrame(islandAnimation);
    if (!islandReady || !animate) {
      islandX = left;
      islandWidth = width;
      islandReady = true;
      return;
    }
    const fromX = islandX;
    const fromWidth = islandWidth;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 280);
      const eased = 1 - Math.pow(1 - progress, 4);
      islandX = fromX + (islandTargetX - fromX) * eased;
      islandWidth = fromWidth + (islandTargetWidth - fromWidth) * eased;
      if (progress < 1) islandAnimation = requestAnimationFrame(step);
    };
    islandAnimation = requestAnimationFrame(step);
  }
  function updateIsland(node: HTMLElement, animate = true) {
    const active = node.querySelector<HTMLElement>('a.active');
    if (!active) return;
    const scale = interfaceScale();
    const navBounds = node.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    islandStrokeWidth = 1 / ((window.devicePixelRatio || 1) * scale);
    moveIsland((activeBounds.left - navBounds.left) / scale + node.scrollLeft, activeBounds.width / scale, animate);
  }
  function trackRepositoryNav(node: HTMLElement) {
    repositoryNav = node;
    let layoutFrame = 0;
    const schedule = () => {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(() => updateIsland(node, false));
    };
    const scaleQuery = window.matchMedia('(min-width: 1200px) and (max-resolution: 1.05dppx)');
    const timer = window.setTimeout(schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    window.addEventListener('resize', schedule);
    scaleQuery.addEventListener('change', schedule);
    schedule();
    return {
      destroy() {
        cancelAnimationFrame(layoutFrame);
        cancelAnimationFrame(islandAnimation);
        window.clearTimeout(timer);
        observer.disconnect();
        window.removeEventListener('resize', schedule);
        scaleQuery.removeEventListener('change', schedule);
        if (repositoryNav === node) repositoryNav = undefined;
      }
    };
  }
  $effect(() => {
    path;
    let frame = 0;
    tick().then(() => {
      const node = repositoryNav;
      if (node) frame = requestAnimationFrame(() => updateIsland(node));
    });
    return () => cancelAnimationFrame(frame);
  });
  $effect(() => {
    const currentRepository = base;
    untrack(() => {
      clearTimeout(copiedTimer);
      cloneOpen = false;
      copied = false;
      cloneProtocol = 'https';
      starred = Boolean(data.repository?.starred);
      starCount = data.repository?.starCount ?? 0;
      starring = false;
      forkOpen = false;
      forking = false;
      forkOwner = data.shellOrganizations?.find((organization: { kind: string }) => organization.kind === 'personal')?.slug ?? '';
      forkName = repositoryName(currentRepository.split('/').at(-1) ?? '');
      forkError = '';
    });
  });
  onDestroy(() => {
    clearTimeout(copiedTimer);
    cancelAnimationFrame(islandAnimation);
  });
</script>

<section class="repo-bar">
  <div class="repo-line">
    <div class="repo-identity"><RepositoryIcon name={repo} src={repository?.iconUrl} size={34} /><div class="identity"><div class="crumb"><a href="/{owner}">{owner}</a><span>/</span><a href={base}>{repo}</a>{#if repository?.visibility === 'private'}<span class="private"><Lock size={11} />Private</span>{/if}</div>{#if repository?.upstream}<p class="upstream"><GitFork size={11} />Forked from <a href="/{repository.upstream.owner}/{repository.upstream.name}">{repository.upstream.owner}/{repository.upstream.name}</a></p>{:else if repository?.description}<p>{repository.description}</p>{/if}</div></div>
    <div class="repo-actions"><Button size="small" loading={starring} aria-label={starred ? 'Unstar repository' : 'Star repository'} onclick={toggleStar}><Star size={14} fill={starred ? 'currentColor' : 'none'} />Star{#if starCount}<span class="count">{starCount}</span>{/if}</Button><Button size="small" disabled={!organizationOptions.length} onclick={() => { forkOwner = organizationOptions[0]?.value ?? ''; forkName = repositoryName(repo); forkError = ''; forkOpen = true; }}><GitFork size={14} />Fork{#if repository?.forkCount}<span class="count">{repository.forkCount}</span>{/if}</Button><div class="clone-anchor" use:dismissable={() => (cloneOpen = false)}><Button size="small" aria-expanded={cloneOpen} onclick={() => (cloneOpen = !cloneOpen)}><Code2 size={14} /><span>Clone</span><ChevronDown size={12} /></Button>{#if cloneOpen}<div class="clone-menu"><strong>Clone this repository</strong>{#if repository?.sshCloneUrl}<div class="protocols"><button class:active={cloneProtocol === 'https'} onclick={() => { cloneProtocol = 'https'; copied = false; }}>HTTPS</button><button class:active={cloneProtocol === 'ssh'} onclick={() => { cloneProtocol = 'ssh'; copied = false; }}>SSH</button></div>{/if}<p>{cloneProtocol === 'ssh' ? 'Authenticate with an SSH key from Developer access.' : 'Authenticate with a Marl developer token.'}</p><div class="clone-value"><code>{cloneUrl}</code><button aria-label="Copy clone URL" onclick={copyCloneUrl}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</button></div></div>{/if}</div></div>
  </div>
  <nav use:trackRepositoryNav aria-label="Repository" onscroll={() => repositoryNav && updateIsland(repositoryNav, false)}>
    <span class="active-island" style={`--island-x:${islandX}px`} aria-hidden="true"><svg viewBox="0 0 1 43" preserveAspectRatio="none"><path class="island-fill" d={islandFill}></path><path class="island-outline" d={islandBoundary} stroke-width={islandStrokeWidth}></path></svg></span>
    <a class:active={tabActive('overview')} href={base}><BookOpen size={14} />Overview</a>
    <a class:active={tabActive('code')} href="{base}/code"><Code2 size={14} />Code</a>
    <a class:active={tabActive('releases')} href="{base}/releases"><Tag size={14} />Releases</a>
    <a class:active={tabActive('issues')} href="{base}/issues"><CircleDot size={14} />Issues</a>
    <a class:active={tabActive('pulls')} href="{base}/pulls"><GitPullRequest size={14} />Pull requests</a>
    <a class:active={tabActive('runs')} href="{base}/runs"><PlayCircle size={14} />Runs</a>
    {#if canManageSettings}<a class:active={tabActive('settings')} href="{base}/settings"><Settings size={14} />Settings</a>{/if}
  </nav>
</section>

<div class="repository-content">{@render children()}</div>

<Modal open={forkOpen} title="Fork repository" description="Create an independent working copy connected to this repository's fork network." onClose={() => (forkOpen = false)}>
  {#snippet children()}<div class="fork-fields"><label><span>Owner</span><Select bind:value={forkOwner} options={organizationOptions} ariaLabel="Fork owner" /></label><label><span>Repository name</span><input bind:value={forkName} oninput={() => (forkName = repositoryName(forkName))} onblur={() => (forkName = submittedForkName)} maxlength="100" /></label>{#if forkError}<p class="fork-error" role="alert">{forkError}</p>{/if}</div>{/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (forkOpen = false)}>Cancel</Button><Button size="small" variant="primary" loading={forking} disabled={!forkOwner || !forkNameValid} onclick={createFork}>Create fork</Button>{/snippet}
</Modal>

<style>
  .repo-bar{border-bottom:1px solid var(--border-subtle);background:var(--surface)}.repo-line{display:flex;width:min(1240px,calc(100% - 48px));min-height:64px;margin:0 auto;align-items:center;justify-content:space-between;gap:20px}.identity{min-width:0}.crumb{display:flex;align-items:center;gap:6px}.crumb>a{color:var(--text-strong);font-size:15px;font-weight:640;text-decoration:none}.crumb>a:first-child{color:var(--text-muted);font-weight:520}.crumb>span:not(.private){color:var(--text-faint)}.private{display:inline-flex;align-items:center;gap:4px;margin-left:5px;color:var(--text-faint);font-size:11px}.identity p{overflow:hidden;margin:5px 0 0;color:var(--text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.clone-anchor{position:relative}.clone-menu{position:absolute;top:40px;right:0;z-index:30;width:360px;padding:14px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.clone-menu>strong{color:var(--text-strong);font-size:13px}.clone-menu>p{margin:8px 0 11px;color:var(--text-muted);font-size:11px}.protocols{display:flex!important;grid-template-columns:none!important;gap:2px;margin-top:10px;border:0!important;background:transparent!important}.protocols button{width:auto!important;height:28px;padding:0 9px;border:0!important;border-radius:5px;background:transparent!important;color:var(--text-muted);font-size:11px;font-weight:620;cursor:pointer}.protocols button.active{background:var(--brand-soft)!important;color:var(--text-strong)}.clone-value{display:grid;grid-template-columns:minmax(0,1fr)34px;border:1px solid var(--border);border-radius:5px;background:var(--surface)}.clone-menu code{overflow:hidden;padding:9px;color:var(--text);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.clone-value button{display:grid;width:34px;border:0;border-left:1px solid var(--border);background:transparent;color:var(--text-muted);place-items:center;cursor:pointer}.repo-bar nav{position:relative;display:flex;width:min(1240px,calc(100% - 48px));height:40px;margin:0 auto;gap:5px}.repo-bar nav a{position:relative;z-index:1;display:inline-flex;height:40px;align-items:center;gap:6px;padding:0 11px;color:var(--text-muted);font-size:12px;font-weight:580;text-decoration:none;transition:color 140ms ease,background-color 180ms ease,transform 220ms cubic-bezier(.2,.8,.2,1)}.repo-bar nav a:hover,.repo-bar nav a.active{color:var(--text-strong)}.repo-bar nav a.active{z-index:2;height:47px;margin-bottom:-7px;padding-bottom:7px;border-radius:0 0 15px 15px;background:var(--surface-raised);box-shadow:inset 0 -1px 0 color-mix(in srgb,var(--border-strong) 75%,transparent);transform:translateY(1px)}.repo-bar nav a.active::before,.repo-bar nav a.active::after{position:absolute;bottom:0;width:10px;height:10px;content:'';pointer-events:none}.repo-bar nav a.active::before{left:-10px;border-bottom-right-radius:10px;box-shadow:4px 4px 0 4px var(--surface-raised)}.repo-bar nav a.active::after{right:-10px;border-bottom-left-radius:10px;box-shadow:-4px 4px 0 4px var(--surface-raised)}.repo-bar nav a.active{background-image:linear-gradient(var(--brand),var(--brand));background-position:center calc(100% - 5px);background-repeat:no-repeat;background-size:calc(100% - 22px) 2px}.repository-content{width:min(1240px,calc(100% - 48px));margin:0 auto;padding:31px 0 72px}
  .repo-bar{--repo-head-height:64px;position:relative;border-bottom:0;background:linear-gradient(to bottom,var(--surface) 0 var(--repo-head-height),var(--canvas) var(--repo-head-height))}.repo-bar nav{z-index:1}.repo-bar nav a{z-index:2}.repo-bar nav a.active{height:40px;margin:0;padding-bottom:0;border-radius:0;background:transparent;background-image:none;box-shadow:none;transform:none}.repo-bar nav a.active::before,.repo-bar nav a.active::after{display:none}.active-island{position:absolute;z-index:1;top:0;left:0;width:1px;height:43px;transform:translate3d(var(--island-x),0,0);pointer-events:none;will-change:transform}.active-island svg{position:absolute;inset:0;width:1px;height:43px;overflow:visible}.island-fill{fill:var(--surface);stroke:none}.island-outline{fill:none;stroke:var(--border-subtle);stroke-linecap:butt;stroke-linejoin:round;vector-effect:non-scaling-stroke}.repository-content{padding-top:27px}
  .repo-actions{display:flex;align-items:center;gap:7px}.count{padding-left:6px;border-left:1px solid var(--border);color:var(--text-faint)}.upstream{display:flex;align-items:center;gap:5px}.upstream a{color:var(--text-muted);text-decoration:none}.upstream a:hover{color:var(--brand)}.fork-fields{display:grid;gap:14px}.fork-fields label{display:grid;gap:7px}.fork-fields label>span{color:var(--text-muted);font-size:11px;font-weight:620}.fork-fields input{width:100%;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:12px}.fork-fields input:focus{border-color:var(--brand)}.fork-fields input:focus-visible{outline:2px solid var(--brand);outline-offset:2px}.fork-error{margin:0;color:var(--danger);font-size:11px}
  .repo-identity{display:flex;min-width:0;align-items:center;gap:10px}
  @media(max-width:680px){.repo-bar{--repo-head-height:57px}.repo-line,.repo-bar nav,.repository-content{width:calc(100% - 28px)}.repo-line{min-height:57px}.identity p,.repo-actions :global(.button span){display:none}.repo-actions{gap:4px}.repo-bar nav{overflow-x:auto}.repo-bar nav a{flex:0 0 auto}.repository-content{padding-top:18px}}
</style>
