<script lang="ts">
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import CloneUrl from './header/CloneUrl.svelte';

  let {
    name,
    defaultBranch,
    cloneUrl,
    sshCloneUrl,
    canPush
  }: { name: string; defaultBranch: string; cloneUrl: string; sshCloneUrl: string; canPush: boolean } = $props();
  const pushCommands = (url: string) =>
    `git remote add origin ${url}\ngit branch -M ${defaultBranch}\ngit push -u origin ${defaultBranch}`;
</script>

<section class="w-full max-w-195 py-6 sm:py-9">
  <header class="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3.5">
    <span class="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand"><GitBranch size={19} /></span>
    <div>
      <h1 class="text-xl font-semibold tracking-tight text-balance text-ink-strong">This repository is empty</h1>
      <p class="mt-1.5 max-w-155 text-sm leading-relaxed text-pretty text-ink-muted">
        Push the first branch to start browsing files, commits, pulls, and releases in {name}.
      </p>
    </div>
  </header>

  {#if canPush}
    <div class="mt-6 sm:ml-13.5">
      <CloneUrl
        heading="Push an existing repository"
        description="Run this from your local project directory."
        {cloneUrl}
        {sshCloneUrl}
        signedIn
        commands={pushCommands}
      />
    </div>
  {:else}
    <p class="mt-5 text-sm text-ink-muted sm:ml-13.5">
      Someone with push access needs to publish the first branch before this repository can be browsed.
    </p>
  {/if}
</section>
