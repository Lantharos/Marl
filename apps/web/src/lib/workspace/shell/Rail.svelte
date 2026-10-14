<script lang="ts">
  import { page } from '$app/state';
  import type { RepositorySummary } from '@marl/contracts';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import Inbox from '@lucide/svelte/icons/inbox';
  import Search from '@lucide/svelte/icons/search';
  import AccountMenu from '#lib/components/shell/AccountMenu.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import type { ShellUser } from '#lib/shell-cache.js';
  import { workspace } from '../store/workspace.svelte';
  import RailLink from './RailLink.svelte';
  import RepositoryMark from './RepositoryMark.svelte';
  import { shell } from './shell-state.svelte';

  let { user, repositories }: { user: ShellUser; repositories: RepositorySummary[] } = $props();
  const path = $derived(page.url.pathname);
  const unread = $derived(workspace.inbox.counts.unread);
  const repositoryFilter = $derived(page.url.searchParams.get('repository'));
  const pinned = $derived(repositories.slice(0, 5));
  const sections = $derived([
    {
      href: '/next',
      label: unread ? `Inbox, ${unread} unread` : 'Inbox',
      icon: Inbox,
      count: unread,
      active: path === '/next'
    },
    {
      href: '/next/pulls',
      label: 'Pulls',
      icon: GitPullRequest,
      count: 0,
      active: (path === '/next/pulls' && !repositoryFilter) || /^\/next\/[^/]+\/[^/]+\/pulls\//.test(path)
    },
    {
      href: '/next/issues',
      label: 'Issues',
      icon: CircleDot,
      count: 0,
      active: path === '/next/issues' || /^\/next\/[^/]+\/[^/]+\/issues\//.test(path)
    },
    { href: '/next/runs', label: 'Runs', icon: CirclePlay, count: 0, active: path === '/next/runs' }
  ]);
</script>

<nav
  class="flex items-center gap-1 border-line-subtle bg-canvas max-md:h-full max-md:justify-around max-md:border-t max-md:px-2 md:flex-col md:border-r md:py-3"
  aria-label="Workspace"
>
  <a class="mb-3 grid size-9 place-items-center max-md:hidden" href="/" aria-label="Marl home"
    ><span class="size-3.5 rounded-[4px] bg-brand"></span></a
  >
  {#each sections as section (section.href)}
    <RailLink href={section.href} label={section.label} active={section.active} count={section.count}>
      {#snippet icon()}<section.icon size={18} />{/snippet}
    </RailLink>
  {/each}
  {#if pinned.length}
    <div class="my-2 h-px w-6 bg-line-subtle max-md:hidden" role="presentation"></div>
    {#each pinned as repository (repository.id)}
      {@const slug = `${repository.owner}/${repository.name}`}
      <RailLink
        href="/next/pulls?repository={encodeURIComponent(slug)}"
        label={slug}
        active={path === '/next/pulls' && repositoryFilter === slug}
        class="max-md:hidden"
      >
        {#snippet icon()}<RepositoryMark {repository} />{/snippet}
      </RailLink>
    {/each}
  {/if}
  <div class="flex-1 max-md:hidden"></div>
  <Tooltip text="Find anything · Ctrl K" placement="right" as="label">
    {#snippet children(tooltip)}
      <button
        {...tooltip}
        type="button"
        class="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-strong"
        aria-keyshortcuts="Control+K Meta+K"
        onclick={() => (shell.paletteOpen = true)}><Search size={18} /></button
      >
    {/snippet}
  </Tooltip>
  <div class="grid size-9 place-items-center md:mt-1"><AccountMenu {user} /></div>
</nav>
