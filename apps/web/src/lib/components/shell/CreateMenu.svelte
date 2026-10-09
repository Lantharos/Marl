<script lang="ts">
  import Import from '@lucide/svelte/icons/import';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Building2 from '@lucide/svelte/icons/building-complex';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import Plus from '@lucide/svelte/icons/plus';
  import Server from '@lucide/svelte/icons/server';
  import Menu from '../overlays/menu/Menu.svelte';
  import MenuItem from '../overlays/menu/MenuItem.svelte';

  const items = [
    { href: '/repositories/new', label: 'Repository', icon: BookOpen },
    { href: '/import', label: 'Import from GitHub', icon: Import },
    { href: '/issues/new', label: 'Issue', icon: CircleDot },
    { href: '/pulls/new', label: 'Pull', icon: GitPullRequest },
    { href: '/organizations?new=1', label: 'Organization', icon: Building2 },
    { href: '/runners/new', label: 'Runner', icon: Server }
  ];
</script>

<Menu label="Create" class="w-52">
  {#snippet trigger(menu)}
    <button
      {...menu}
      aria-label="Create"
      class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-surface px-2 text-xs font-semibold text-ink shadow-surface transition-colors hover:bg-surface-muted hover:text-ink-strong max-sm:w-8 max-sm:px-0"
      ><Plus size={15} /><span class="max-sm:hidden">New</span><ChevronDown size={13} class="max-sm:hidden" /></button
    >
  {/snippet}
  {#each items as item (item.href)}<MenuItem href={item.href} icon={item.icon}>{item.label}</MenuItem>{/each}
</Menu>
