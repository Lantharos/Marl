<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Building2 from '@lucide/svelte/icons/building-complex';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import Plus from '@lucide/svelte/icons/plus';
  import Server from '@lucide/svelte/icons/server';
  import { dismissable } from '$lib/actions/dismissable';
  import { popoverMotion } from '$lib/ui/popover';
  import MenuLink from './MenuLink.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  const items = [
    { href: '/repositories/new', label: 'Repository', icon: BookOpen },
    { href: '/issues/new', label: 'Issue', icon: CircleDot },
    { href: '/pulls/new', label: 'Pull', icon: GitPullRequest },
    { href: '/organizations?new=1', label: 'Organization', icon: Building2 },
    { href: '/runners/new', label: 'Runner', icon: Server }
  ];
</script>

<div class="relative" use:dismissable={() => (open = false)}>
  <button
    aria-label="Create"
    aria-expanded={open}
    onclick={() => (open = !open)}
    class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-surface px-2 text-xs font-semibold text-ink shadow-surface transition-colors hover:bg-surface-muted hover:text-ink-strong max-sm:w-8 max-sm:px-0"
    ><Plus size={15} /><span class="max-sm:hidden">New</span><ChevronDown size={13} class="max-sm:hidden" /></button
  >
  {#if open}
    <div class="absolute top-10 right-0 z-80 w-52 origin-top-right popover p-1.5" transition:popoverMotion>
      {#each items as item (item.href)}<MenuLink href={item.href} icon={item.icon} onclick={() => (open = false)}
          >{item.label}</MenuLink
        >{/each}
    </div>
  {/if}
</div>
