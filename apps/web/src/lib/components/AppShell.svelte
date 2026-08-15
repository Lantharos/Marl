<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import type { RepositorySummary } from '@sty/contracts';
  import Bell from 'lucide-svelte/icons/bell';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import Menu from 'lucide-svelte/icons/menu';
  import Moon from 'lucide-svelte/icons/moon';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import Server from 'lucide-svelte/icons/server';
  import Sun from 'lucide-svelte/icons/sun';
  import X from 'lucide-svelte/icons/x';
  import { api } from '$lib/api';
  import BrandMark from './BrandMark.svelte';

  let { children } = $props();
  let theme = $state<'light' | 'dark'>('dark');
  let searchOpen = $state(false);
  let mobileOpen = $state(false);
  let createOpen = $state(false);
  let profileOpen = $state(false);
  let searchInput = $state<HTMLInputElement>();
  let repositories = $state<RepositorySummary[]>([]);
  const currentPath = $derived($page.url.pathname);

  onMount(() => {
    theme = localStorage.getItem('sty-theme') === 'light' ? 'light' : 'dark';
    applyTheme();
    void api<{ repositories: RepositorySummary[] }>('/repositories').then((result) => (repositories = result.repositories)).catch(() => {});
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchOpen ? (searchOpen = false) : openSearch(); }
      if (event.key === 'Escape') { searchOpen = false; mobileOpen = false; createOpen = false; profileOpen = false; }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0f' : '#f7f6f3');
  }
  function toggleTheme() { theme = theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('sty-theme', theme); applyTheme(); }
  function openSearch() { searchOpen = true; void tick().then(() => searchInput?.focus()); }
  function active(path: string) { return path === '/' ? currentPath === '/' : currentPath.startsWith(path); }
</script>

<div class="shell">
  <header class="workbar">
    <a class="brand-link" href="/"><BrandMark /></a>
    <nav class:open={mobileOpen} aria-label="Global navigation">
      <a class:active={active('/')} href="/" onclick={() => (mobileOpen = false)}>Home</a>
      <a class:active={active('/pulls')} href="/pulls" onclick={() => (mobileOpen = false)}>Pull requests</a>
      <a class:active={active('/runs')} href="/runs" onclick={() => (mobileOpen = false)}>Runs</a>
      <a class:active={active('/repositories')} href="/repositories" onclick={() => (mobileOpen = false)}>Repositories</a>
      <a class:active={active('/runners')} href="/runners" onclick={() => (mobileOpen = false)}>Runners</a>
    </nav>
    <button class="search" onclick={openSearch}><Search size={15} /><span>Find anything</span><kbd>Ctrl K</kbd></button>
    <div class="actions">
      <button class="new" aria-expanded={createOpen} onclick={() => { createOpen = !createOpen; profileOpen = false; }}><Plus size={15} /><span>New</span><ChevronDown size={12} /></button>
      {#if createOpen}<div class="popover create-menu"><a href="/repositories/new"><BookOpen size={15} /><span><strong>Repository</strong><small>Start or import code</small></span></a><a href="/pulls/new"><GitPullRequest size={15} /><span><strong>Pull request</strong><small>Put a branch up for review</small></span></a></div>{/if}
      <a class="icon" href="/pulls" aria-label="Notifications"><Bell size={17} /></a>
      <button class="avatar-button" aria-expanded={profileOpen} onclick={() => { profileOpen = !profileOpen; createOpen = false; }}>K</button>
      {#if profileOpen}<div class="popover profile-menu"><div><span class="avatar">K</span><span><strong>Kristof Imeri</strong><small>@kristof</small></span></div><button onclick={toggleTheme}>{#if theme === 'dark'}<Sun size={15} />Light appearance{:else}<Moon size={15} />Dark appearance{/if}</button></div>{/if}
      <button class="mobile-toggle" aria-label="Toggle navigation" onclick={() => (mobileOpen = !mobileOpen)}>{#if mobileOpen}<X size={18} />{:else}<Menu size={18} />{/if}</button>
    </div>
  </header>
  <main class="content">{@render children()}</main>
</div>

{#if searchOpen}
  <div class="dialog-layer" role="presentation" onclick={(event) => event.currentTarget === event.target && (searchOpen = false)}>
    <div class="command-dialog" role="dialog" aria-modal="true" aria-label="Search Sty">
      <header><Search size={18} /><input bind:this={searchInput} placeholder="Repositories, pull requests, runs…" /><kbd>Esc</kbd></header>
      <section><p>Jump to</p>{#each repositories.slice(0,4) as repository}<a href="/{repository.owner}/{repository.name}" onclick={() => (searchOpen = false)}><BookOpen size={15} /><span><strong>{repository.owner}/{repository.name}</strong><small>{repository.description}</small></span></a>{/each}<a href="/pulls" onclick={() => (searchOpen = false)}><GitPullRequest size={15} /><span><strong>Pull requests</strong><small>Your review queue</small></span></a><a href="/runs" onclick={() => (searchOpen = false)}><CircleDot size={15} /><span><strong>Runs</strong><small>Automation across your code</small></span></a><a href="/runners" onclick={() => (searchOpen = false)}><Server size={15} /><span><strong>Runners</strong><small>Your connected machines</small></span></a></section>
    </div>
  </div>
{/if}

<style>
  .shell{min-height:100vh;background:var(--canvas);color:var(--text)}.workbar{position:fixed;inset:0 0 auto;z-index:50;display:grid;grid-template-columns:auto auto minmax(210px,420px) 1fr;align-items:center;gap:20px;height:52px;padding:0 20px;border-bottom:1px solid var(--border-subtle);background:color-mix(in srgb,var(--canvas) 90%,transparent);backdrop-filter:blur(18px)}.brand-link{display:flex;padding:5px 3px;color:inherit;text-decoration:none}.workbar nav{display:flex;align-self:stretch;gap:2px}.workbar nav a{position:relative;display:flex;align-items:center;padding:0 10px;color:var(--text-muted);font-size:12px;font-weight:570;text-decoration:none}.workbar nav a:hover{color:var(--text-strong)}.workbar nav a.active{color:var(--text-strong)}.workbar nav a.active::after{position:absolute;inset:auto 9px 0;height:2px;background:var(--brand);content:''}.search{display:flex;align-items:center;gap:8px;height:30px;padding:0 7px 0 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-faint);cursor:text}.search span{flex:1;text-align:left;font-size:11px}.search kbd,.command-dialog kbd{padding:2px 5px;border:1px solid var(--border);border-radius:4px;background:var(--surface-muted);color:var(--text-faint);font-family:inherit;font-size:9px}.actions{position:relative;display:flex;justify-content:flex-end;align-items:center;gap:5px}.new,.icon,.mobile-toggle{display:inline-flex;height:30px;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer}.new{gap:5px;padding:0 8px;border-color:var(--border);background:var(--surface);font-size:11px;font-weight:620}.new:hover,.icon:hover,.mobile-toggle:hover{background:var(--surface-muted);color:var(--text-strong)}.icon,.mobile-toggle{width:30px}.avatar-button,.avatar{display:grid;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-weight:760}.avatar-button{width:28px;height:28px;margin-left:2px;border:0;cursor:pointer;font-size:11px}.popover{position:absolute;top:38px;z-index:80;width:230px;padding:5px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.create-menu{right:62px}.profile-menu{right:0}.popover>a,.popover>button{display:flex;width:100%;align-items:flex-start;gap:9px;padding:8px;border:0;border-radius:5px;background:transparent;color:var(--text);text-align:left;text-decoration:none;cursor:pointer}.popover>a:hover,.popover>button:hover{background:var(--surface-muted)}.popover strong,.popover small{display:block}.popover strong{color:var(--text-strong);font-size:11px}.popover small{margin-top:2px;color:var(--text-faint);font-size:9px}.profile-menu>div{display:grid;grid-template-columns:30px 1fr;align-items:center;gap:9px;padding:8px 8px 11px;border-bottom:1px solid var(--border-subtle)}.avatar{width:29px;height:29px}.profile-menu>button{align-items:center;margin-top:4px;font-size:10px}.mobile-toggle{display:none}.content{min-height:100vh;padding-top:52px}.dialog-layer{position:fixed;z-index:100;inset:0;display:flex;justify-content:center;padding-top:84px;background:rgb(0 0 0/.58);backdrop-filter:blur(3px)}.command-dialog{width:min(610px,calc(100vw - 28px));overflow:hidden;border:1px solid var(--border-strong);border-radius:9px;background:var(--surface-raised);box-shadow:0 28px 90px rgb(0 0 0/.5)}.command-dialog>header{display:flex;align-items:center;gap:10px;padding:13px;border-bottom:1px solid var(--border);color:var(--text-faint)}.command-dialog input{flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:14px}.command-dialog section{padding:6px}.command-dialog section>p{margin:7px 7px 5px;color:var(--text-faint);font-size:9px}.command-dialog section>a{display:grid;grid-template-columns:22px 1fr;align-items:center;gap:7px;padding:8px;border-radius:5px;color:var(--text-muted);text-decoration:none}.command-dialog section>a:hover{background:var(--surface-muted);color:var(--text-strong)}.command-dialog section strong,.command-dialog section small{display:block}.command-dialog section strong{font-size:11px}.command-dialog section small{overflow:hidden;max-width:470px;margin-top:2px;color:var(--text-faint);font-size:9px;text-overflow:ellipsis;white-space:nowrap}
  @media(max-width:1000px){.workbar{grid-template-columns:auto minmax(210px,1fr) auto}.workbar nav{position:absolute;top:52px;left:0;display:none;width:100%;height:auto;padding:8px;border-bottom:1px solid var(--border);background:var(--surface-raised)}.workbar nav.open{display:grid}.workbar nav a{min-height:36px;border-radius:5px}.workbar nav a.active{background:var(--surface-muted)}.workbar nav a.active::after{display:none}.mobile-toggle{display:inline-flex}.search{grid-column:2}.actions{grid-column:3}}
  @media(max-width:600px){.workbar{grid-template-columns:auto 1fr auto;gap:9px;padding:0 10px}.search{justify-self:end;width:30px;padding:0;justify-content:center;border-color:transparent;background:transparent}.search span,.search kbd,.new span,.new :global(svg:last-child),.icon{display:none}.new{width:30px;padding:0}.dialog-layer{padding-top:62px}}
</style>
