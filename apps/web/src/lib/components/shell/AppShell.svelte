<script lang="ts">
  import { goto } from '$app/navigation';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import Building2 from 'lucide-svelte/icons/building-2';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitCommit from 'lucide-svelte/icons/git-commit-horizontal';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import FileCode from 'lucide-svelte/icons/file-code-2';
  import Home from 'lucide-svelte/icons/house';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import LogOut from 'lucide-svelte/icons/log-out';
  import Menu from 'lucide-svelte/icons/menu';
  import Moon from 'lucide-svelte/icons/moon';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import Server from 'lucide-svelte/icons/server';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Settings from 'lucide-svelte/icons/settings';
  import Sun from 'lucide-svelte/icons/sun';
  import X from 'lucide-svelte/icons/x';
  import { dismissable } from '$lib/actions/dismissable';
  import BrandMark from '../BrandMark.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import { authClient } from '$lib/auth-client';
  import { api } from '$lib/api';

  type CommandKind = 'home' | 'repository' | 'organization' | 'commit' | 'file' | 'pull' | 'run' | 'runner' | 'create' | 'settings' | 'security' | 'branch' | 'key';
  type Command = { label: string; detail: string; href: string; keywords: string; kind: CommandKind };

  type ShellUser = { id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null };
  type ShellOrganization = { slug: string; name: string; avatarUrl: string | null; role: string };
  let { repositories, organizations, user, children } = $props<{ repositories: RepositorySummary[]; organizations: ShellOrganization[]; user: ShellUser; children: import('svelte').Snippet }>();
  let theme = $state<'light' | 'dark'>('dark');
  let searchOpen = $state(false);
  let mobileOpen = $state(false);
  let createOpen = $state(false);
  let profileOpen = $state(false);
  let searchInput = $state<HTMLInputElement>();
  let commandList = $state<HTMLElement>();
  let query = $state('');
  let remoteResults = $state<Command[]>([]);
  let searchLoading = $state(false);
  let selectedIndex = $state(0);
  const currentPath = $derived($page.url.pathname);
  const commands = $derived<Command[]>([
    { label: 'Home', detail: 'Your work across Marl', href: '/', keywords: 'dashboard overview', kind: 'home' },
    ...repositories.map((repository: RepositorySummary) => ({
      label: `${repository.owner}/${repository.name}`,
      detail: repository.description || 'Repository',
      href: `/${repository.owner}/${repository.name}`,
      keywords: `repository code ${repository.visibility}`,
      kind: 'repository' as const
    })),
    ...repositories.flatMap((repository: RepositorySummary) => {
      const base = `/${repository.owner}/${repository.name}`;
      return [
        { label: `${repository.owner}/${repository.name} pull requests`, detail: 'Repository pull requests', href: `${base}/pulls`, keywords: 'repository reviews merge', kind: 'pull' as const },
        { label: `${repository.owner}/${repository.name} runs`, detail: 'Repository workflow runs', href: `${base}/runs`, keywords: 'repository automation jobs checks', kind: 'run' as const },
        { label: `${repository.owner}/${repository.name} settings`, detail: 'Repository general settings', href: `${base}/settings`, keywords: 'repository settings general', kind: 'settings' as const },
        { label: `${repository.owner}/${repository.name} branch rules`, detail: 'Protected branches and merge requirements', href: `${base}/settings/branches`, keywords: 'repository settings branches protection', kind: 'branch' as const },
        { label: `${repository.owner}/${repository.name} access`, detail: 'Collaborators and team access', href: `${base}/settings/access`, keywords: 'repository settings people teams permissions', kind: 'security' as const },
        { label: `${repository.owner}/${repository.name} secrets`, detail: 'Repository CI secrets', href: `${base}/settings/secrets`, keywords: 'repository settings ci environment', kind: 'key' as const }
      ];
    }),
    { label: 'Settings', detail: 'Your profile and account', href: '/settings/account/profile', keywords: 'account preferences profile', kind: 'settings' },
    { label: 'Sign-in and security', detail: 'Password, passkeys, and two-factor authentication', href: '/settings/account', keywords: 'settings account authentication', kind: 'security' },
    { label: 'Sessions', detail: 'Devices signed in to your account', href: '/settings/account/sessions', keywords: 'settings account devices', kind: 'security' },
    { label: 'Developer access', detail: 'Personal access tokens', href: '/settings/account/tokens', keywords: 'settings account api tokens', kind: 'key' },
    { label: 'SSH keys', detail: 'Git authentication and commit signing', href: '/settings/account/ssh-keys', keywords: 'settings developer git signing', kind: 'key' },
    { label: 'Organizations', detail: 'Every organization you belong to', href: '/organizations', keywords: 'teams workspaces settings', kind: 'organization' },
    ...organizations.flatMap((organization: ShellOrganization) => {
      const base = `/organizations/${organization.slug}/settings`;
      return [
        { label: organization.name, detail: `Organization · ${organization.slug}`, href: `${base}/profile`, keywords: `organization profile ${organization.slug}`, kind: 'organization' as const },
        { label: `${organization.name} people and teams`, detail: 'Organization members and default access', href: `${base}/access`, keywords: `organization settings access ${organization.slug}`, kind: 'security' as const },
        ...(organization.role === 'member' ? [] : [{ label: `${organization.name} CI secrets`, detail: 'Organization workflow secrets', href: `${base}/secrets`, keywords: `organization settings ci ${organization.slug}`, kind: 'key' as const }])
      ];
    }),
    { label: 'Pull requests', detail: 'Your review queue', href: '/pulls', keywords: 'reviews merge changes', kind: 'pull' },
    { label: 'Runs', detail: 'Automation across your code', href: '/runs', keywords: 'workflows jobs checks', kind: 'run' },
    { label: 'Repositories', detail: 'Browse every project', href: '/repositories', keywords: 'code projects', kind: 'repository' },
    { label: 'Runners', detail: 'Connected self-hosted machines', href: '/runners', keywords: 'machines agents docker', kind: 'runner' },
    { label: 'New repository', detail: 'Create or import code', href: '/repositories/new', keywords: 'create import', kind: 'create' },
    { label: 'New organization', detail: 'Create a shared home for projects', href: '/organizations?new=1', keywords: 'create team workspace', kind: 'organization' },
    { label: 'New pull request', detail: 'Put a branch up for review', href: '/pulls/new', keywords: 'create review', kind: 'create' },
    { label: 'Connect runner', detail: 'Add a self-hosted machine', href: '/runners/new', keywords: 'create machine agent', kind: 'create' }
  ]);
  const results = $derived.by(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return commands;
    const local = commands.filter((command) => {
      const haystack = `${command.label} ${command.detail} ${command.keywords}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return [...local, ...remoteResults.filter((remote) => !local.some((command) => command.href === remote.href))];
  });

  $effect(() => {
    const value = query.trim();
    remoteResults = [];
    searchLoading = value.length >= 2;
    if (value.length < 2) return;
    let canceled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await api<{ results: Command[] }>(`/search?q=${encodeURIComponent(value)}`);
        if (!canceled) remoteResults = response.results.map((result) => ({ ...result, keywords: result.detail }));
      } catch {
        if (!canceled) remoteResults = [];
      } finally {
        if (!canceled) searchLoading = false;
      }
    }, 140);
    return () => { canceled = true; clearTimeout(timer); };
  });

  onMount(() => {
    theme = localStorage.getItem('marl-theme') === 'light' ? 'light' : 'dark';
    applyTheme();
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchOpen ? closeSearch() : openSearch();
      }
      if (event.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0f' : '#f7f6f3');
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('marl-theme', theme);
    applyTheme();
    profileOpen = false;
  }

  function openSearch() {
    query = '';
    selectedIndex = 0;
    searchOpen = true;
    createOpen = false;
    profileOpen = false;
    void tick().then(() => searchInput?.focus());
  }

  function closeSearch() { searchOpen = false; }
  function closeAll() { searchOpen = false; mobileOpen = false; createOpen = false; profileOpen = false; }
  function active(path: string) { return path === '/' ? currentPath === '/' : currentPath.startsWith(path); }

  async function runCommand(command: Command) {
    closeAll();
    await goto(command.href);
  }

  async function signOut() {
    await authClient.signOut();
    await invalidateAll();
    await goto('/sign-in');
  }

  async function commandKeydown(event: KeyboardEvent) {
    if (!results.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); selectedIndex = (selectedIndex + 1) % results.length; }
    if (event.key === 'ArrowUp') { event.preventDefault(); selectedIndex = (selectedIndex - 1 + results.length) % results.length; }
    if (event.key === 'Home') { event.preventDefault(); selectedIndex = 0; }
    if (event.key === 'End') { event.preventDefault(); selectedIndex = results.length - 1; }
    if (event.key === 'Enter' && results[selectedIndex]) { event.preventDefault(); void runCommand(results[selectedIndex]); }
    await tick();
    commandList?.querySelector(`[data-command="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }
</script>

<div class="shell">
  <header class="workbar" use:dismissable={() => (mobileOpen = false)}>
    <a class="brand-link" href="/"><BrandMark /></a>
    <nav class:open={mobileOpen} aria-label="Global navigation">
      <a class:active={active('/')} href="/" onclick={() => (mobileOpen = false)}>Home</a>
      <a class:active={active('/pulls')} href="/pulls" onclick={() => (mobileOpen = false)}>Pull requests</a>
      <a class:active={active('/runs')} href="/runs" onclick={() => (mobileOpen = false)}>Runs</a>
      <a class:active={active('/repositories')} href="/repositories" onclick={() => (mobileOpen = false)}>Repositories</a>
      <a class:active={active('/runners')} href="/runners" onclick={() => (mobileOpen = false)}>Runners</a>
    </nav>
    <button class="search" aria-label="Find anything" onclick={openSearch}><Search size={15} /><span>Find anything</span><kbd>Ctrl K</kbd></button>
    <div class="actions">
      <div class="menu-anchor" use:dismissable={() => (createOpen = false)}>
        <button class="new" aria-expanded={createOpen} onclick={() => { createOpen = !createOpen; profileOpen = false; }}><Plus size={15} /><span>New</span><ChevronDown size={12} /></button>
        {#if createOpen}<div class="popover create-menu"><a href="/repositories/new" onclick={() => (createOpen = false)}><BookOpen size={15} /><span><strong>Repository</strong><small>Start or import code</small></span></a><a href="/organizations?new=1" onclick={() => (createOpen = false)}><Building2 size={15} /><span><strong>Organization</strong><small>Create a home for a team</small></span></a><a href="/pulls/new" onclick={() => (createOpen = false)}><GitPullRequest size={15} /><span><strong>Pull request</strong><small>Put a branch up for review</small></span></a></div>{/if}
      </div>
      <div class="menu-anchor" use:dismissable={() => (profileOpen = false)}>
        <button class="avatar-button" aria-label="Account menu" aria-expanded={profileOpen} onclick={() => { profileOpen = !profileOpen; createOpen = false; }}><UserAvatar name={user.displayName || user.handle} src={user.avatarUrl} size={28} /></button>
        {#if profileOpen}<div class="popover profile-menu"><div><UserAvatar name={user.displayName || user.handle} src={user.avatarUrl} size={29} /><span><strong>{user.displayName}</strong><small>@{user.handle}</small></span></div><a href="/settings/account/profile" onclick={() => (profileOpen = false)}><Settings size={15} />Settings</a><a href="/organizations" onclick={() => (profileOpen = false)}><Building2 size={15} />Organizations</a><button onclick={toggleTheme}>{#if theme === 'dark'}<Sun size={15} />Light appearance{:else}<Moon size={15} />Dark appearance{/if}</button><button onclick={signOut}><LogOut size={15} />Sign out</button></div>{/if}
      </div>
      <button class="mobile-toggle" aria-label="Toggle navigation" onclick={() => (mobileOpen = !mobileOpen)}>{#if mobileOpen}<X size={18} />{:else}<Menu size={18} />{/if}</button>
    </div>
  </header>
  <main class="content">{@render children()}</main>
</div>

{#if searchOpen}
  <div class="dialog-layer" role="presentation" onclick={(event) => event.currentTarget === event.target && closeSearch()}>
    <div class="command-dialog" role="dialog" aria-modal="true" aria-label="Search Marl">
      <header><Search size={18} /><input bind:this={searchInput} bind:value={query} oninput={() => (selectedIndex = 0)} onkeydown={commandKeydown} placeholder="Repositories, pull requests, runs..." /><kbd>Esc</kbd></header>
      <section bind:this={commandList} aria-label="Commands">
        <p>{query ? (searchLoading ? 'Searching Marl…' : `${results.length} results`) : 'Jump to'}</p>
        {#each results as command, index}
          <button data-command={index} class:selected={index === selectedIndex} onmouseenter={() => (selectedIndex = index)} onclick={() => runCommand(command)}>
            {#if command.kind === 'home'}<Home size={16} />{:else if command.kind === 'repository'}<BookOpen size={16} />{:else if command.kind === 'organization'}<Building2 size={16} />{:else if command.kind === 'commit'}<GitCommit size={16} />{:else if command.kind === 'file'}<FileCode size={16} />{:else if command.kind === 'pull'}<GitPullRequest size={16} />{:else if command.kind === 'run'}<CircleDot size={16} />{:else if command.kind === 'runner'}<Server size={16} />{:else if command.kind === 'settings'}<Settings size={16} />{:else if command.kind === 'security'}<ShieldCheck size={16} />{:else if command.kind === 'branch'}<GitBranch size={16} />{:else if command.kind === 'key'}<KeyRound size={16} />{:else}<Plus size={16} />{/if}
            <span><strong>{command.label}</strong><small>{command.detail}</small></span>
          </button>
        {:else}{#if !searchLoading}<div class="no-results"><strong>Nothing found</strong><span>Try a repository, path, commit, pull request, or run.</span></div>{/if}{/each}
      </section>
    </div>
  </div>
{/if}

<style>
  .shell{min-height:100vh;background:var(--canvas);color:var(--text)}.workbar{position:fixed;inset:0 0 auto;z-index:50;display:grid;grid-template-columns:auto auto minmax(210px,420px) 1fr;align-items:center;gap:20px;height:52px;padding:0 20px;border-bottom:1px solid var(--border-subtle);background:color-mix(in srgb,var(--canvas) 90%,transparent);backdrop-filter:blur(18px)}.brand-link{display:flex;padding:5px 3px;color:inherit;text-decoration:none}.workbar nav{display:flex;align-self:stretch;gap:2px}.workbar nav a{position:relative;display:flex;align-items:center;padding:0 10px;color:var(--text-muted);font-size:12px;font-weight:570;text-decoration:none}.workbar nav a:hover,.workbar nav a.active{color:var(--text-strong)}.workbar nav a.active::after{position:absolute;inset:auto 9px 0;height:2px;background:var(--brand);content:''}.search{display:flex;align-items:center;gap:8px;height:30px;padding:0 7px 0 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-faint);cursor:text}.search span{flex:1;text-align:left;font-size:11px}.search kbd,.command-dialog kbd{padding:2px 5px;border:1px solid var(--border);border-radius:4px;background:var(--surface-muted);color:var(--text-faint);font-family:inherit;font-size:9px}.actions{display:flex;justify-content:flex-end;align-items:center;gap:5px}.menu-anchor{position:relative}.new,.mobile-toggle{display:inline-flex;height:30px;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer}.new{gap:5px;padding:0 8px;border-color:var(--border);background:var(--surface);font-size:11px;font-weight:620}.new:hover,.mobile-toggle:hover{background:var(--surface-muted);color:var(--text-strong)}.avatar-button{display:grid;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-weight:760}.avatar-button{width:28px;height:28px;border:0;cursor:pointer;font-size:11px}.popover{position:absolute;top:38px;right:0;z-index:80;width:230px;padding:5px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.popover>a,.popover>button{display:flex;width:100%;align-items:flex-start;gap:9px;padding:8px;border:0;border-radius:5px;background:transparent;color:var(--text);text-align:left;text-decoration:none;cursor:pointer}.popover>a:hover,.popover>button:hover{background:var(--surface-muted)}.popover strong,.popover small{display:block}.popover strong{color:var(--text-strong);font-size:11px}.popover small{margin-top:2px;color:var(--text-faint);font-size:9px}.profile-menu>div{display:grid;grid-template-columns:30px 1fr;align-items:center;gap:9px;padding:8px 8px 11px;border-bottom:1px solid var(--border-subtle)}.profile-menu>button{align-items:center;margin-top:4px;font-size:10px}.mobile-toggle{display:none;width:30px}.content{min-height:100vh;padding-top:52px}.dialog-layer{position:fixed;z-index:100;inset:0;display:flex;justify-content:center;padding-top:84px;background:rgb(0 0 0/.58);backdrop-filter:blur(3px)}.command-dialog{width:min(610px,calc(100vw - 28px));height:fit-content;max-height:min(570px,calc(100vh - 112px));overflow:hidden;border:1px solid var(--border-strong);border-radius:9px;background:var(--surface-raised);box-shadow:0 28px 90px rgb(0 0 0/.5)}.command-dialog>header{display:flex;align-items:center;gap:10px;padding:13px;border-bottom:1px solid var(--border);color:var(--text-faint)}.command-dialog input{flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:14px}.command-dialog section{max-height:500px;overflow:auto;padding:6px}.command-dialog section>p{margin:7px 7px 5px;color:var(--text-faint);font-size:9px}.command-dialog section>button{display:grid;width:100%;grid-template-columns:22px 1fr;align-items:center;gap:7px;padding:8px;border:0;border-radius:5px;background:transparent;color:var(--text-muted);cursor:pointer;text-align:left}.command-dialog section>button:hover,.command-dialog section>button.selected{background:var(--surface-muted);color:var(--text-strong)}.command-dialog section strong,.command-dialog section small{display:block}.command-dialog section strong{font-size:11px}.command-dialog section small{overflow:hidden;max-width:470px;margin-top:2px;color:var(--text-faint);font-size:9px;text-overflow:ellipsis;white-space:nowrap}.no-results{padding:36px 10px;color:var(--text-faint);text-align:center}.no-results strong,.no-results span{display:block}.no-results strong{color:var(--text-strong);font-size:11px}.no-results span{margin-top:5px;font-size:9px}
  .avatar-button{overflow:hidden;padding:0;background:transparent}.profile-menu>a{align-items:center;margin-top:4px;font-size:10px}
  @media(max-width:1000px){.workbar{grid-template-columns:auto minmax(210px,1fr) auto}.workbar nav{position:absolute;top:52px;left:0;display:none;width:100%;height:auto;padding:8px;border-bottom:1px solid var(--border);background:var(--surface-raised)}.workbar nav.open{display:grid}.workbar nav a{min-height:36px;border-radius:5px}.workbar nav a.active{background:var(--surface-muted)}.workbar nav a.active::after{display:none}.mobile-toggle{display:inline-flex}.search{grid-column:2}.actions{grid-column:3}}
  @media(max-width:600px){.workbar{grid-template-columns:auto 1fr auto;gap:9px;padding:0 10px}.search{justify-self:end;width:30px;padding:0;justify-content:center;border-color:transparent;background:transparent}.search span,.search kbd,.new span,.new :global(svg:last-child){display:none}.new{width:30px;padding:0}.dialog-layer{padding-top:62px}}
</style>
