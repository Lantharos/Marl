<script lang="ts">
  import { page } from '$app/state';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import Home from '@lucide/svelte/icons/house';
  import Inbox from '@lucide/svelte/icons/inbox';
  import Server from '@lucide/svelte/icons/server';

  let { open, onNavigate }: { open: boolean; onNavigate: () => void } = $props();
  const destinations = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/inbox', label: 'Inbox', icon: Inbox },
    { href: '/issues', label: 'Issues', icon: CircleDot },
    { href: '/pulls', label: 'Pulls', icon: GitPullRequest },
    { href: '/runs', label: 'Runs', icon: CirclePlay },
    { href: '/repositories', label: 'Repositories', icon: BookOpen },
    { href: '/runners', label: 'Runners', icon: Server }
  ];
  const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<nav
  aria-label="Global navigation"
  class={[
    'absolute inset-x-0 top-13 grid gap-0.5 border-b border-line bg-surface-raised p-2 lg:static lg:flex lg:items-center lg:gap-0.5 lg:border-0 lg:bg-transparent lg:p-0',
    open ? 'grid' : 'hidden lg:flex'
  ]}
>
  {#each destinations as destination (destination.href)}
    {@const current = active(destination.href)}
    <a
      href={destination.href}
      aria-current={current ? 'page' : undefined}
      onclick={onNavigate}
      class={[
        'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors lg:grid lg:size-9 lg:place-items-center lg:p-0',
        current
          ? 'bg-surface-muted text-ink-strong lg:bg-transparent'
          : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
      ]}
    >
      <destination.icon size={18} />
      <span class="lg:sr-only">{destination.label}</span>
      <span
        class="pointer-events-none absolute top-11 left-1/2 z-90 hidden -translate-x-1/2 -translate-y-0.5 rounded-md bg-surface-raised px-2 py-1 text-xs whitespace-nowrap text-ink opacity-0 shadow-popover transition-[opacity,translate] duration-100 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 lg:block"
        aria-hidden="true">{destination.label}</span
      >
      {#if current}<span class="absolute inset-x-2 -bottom-2 hidden h-0.5 rounded-full bg-brand lg:block"></span>{/if}
    </a>
  {/each}
</nav>
