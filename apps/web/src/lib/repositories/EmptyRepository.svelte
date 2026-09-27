<script lang="ts">
  import { resolve } from '$app/paths';
  import { onDestroy } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Button from '$lib/components/controls/Button.svelte';

  let {
    name,
    defaultBranch,
    cloneUrl,
    sshCloneUrl,
    canPush
  }: { name: string; defaultBranch: string; cloneUrl: string; sshCloneUrl: string | null; canPush: boolean } = $props();
  let protocol = $state<'https' | 'ssh'>('https');
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const activeCloneUrl = $derived(protocol === 'ssh' ? (sshCloneUrl ?? cloneUrl) : cloneUrl);
  const commands = $derived(
    `git remote add origin ${activeCloneUrl}\ngit branch -M ${defaultBranch}\ngit push -u origin ${defaultBranch}`
  );

  async function copyCommands() {
    await navigator.clipboard.writeText(commands);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1600);
  }

  onDestroy(() => clearTimeout(copiedTimer));
</script>

{#snippet segment(value: 'https' | 'ssh', label: string)}
  <button
    type="button"
    aria-pressed={protocol === value}
    class={[
      'h-7 rounded-md px-2.5 text-xs font-semibold transition-colors',
      protocol === value ? 'bg-surface-raised text-ink-strong shadow-subtle' : 'text-ink-muted hover:text-ink-strong'
    ]}
    onclick={() => {
      protocol = value;
      copied = false;
    }}>{label}</button
  >
{/snippet}

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
      <div class="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong class="block text-sm font-semibold text-ink-strong">Push an existing repository</strong>
          <span class="mt-0.5 block text-xs text-ink-muted">Run this from your local project directory.</span>
        </div>
        {#if sshCloneUrl}<div class="flex gap-0.5 rounded-lg bg-surface-muted p-0.5" aria-label="Git protocol">
            {@render segment('https', 'HTTPS')}{@render segment('ssh', 'SSH')}
          </div>{/if}
      </div>
      <div class="relative rounded-lg bg-surface-muted">
        <pre class="overflow-x-auto py-3.5 pr-12 pl-4 font-mono text-[13px] leading-[1.75] text-ink-strong"><code
            >{commands}</code
          ></pre>
        <Button
          icon
          size="small"
          variant="ghost"
          class="absolute top-2 right-2"
          aria-label="Copy push commands"
          onclick={copyCommands}
          >{#if copied}<Check size={15} class="text-success" />{:else}<Copy size={15} />{/if}</Button
        >
      </div>
      <p
        class="mt-3.5 max-w-155 text-sm leading-relaxed text-pretty text-ink-muted [&_a]:font-medium [&_a]:text-brand [&_a:hover]:underline"
      >
        {#if protocol === 'https'}
          Git authentication is separate from your browser session. Use your Marl username and a <a
            href={resolve('/settings/account/tokens')}>developer token</a
          > as the password. Read access is enough to clone and pull; pushing requires Push code.
        {:else}
          Add the public half of your key under <a href={resolve('/settings/account/ssh-keys')}>SSH keys</a>. Marl
          matches its fingerprint to your account and checks repository access for every pull and push.
        {/if}
      </p>
    </div>
  {:else}
    <p class="mt-5 text-sm text-ink-muted sm:ml-13.5">
      Someone with push access needs to publish the first branch before this repository can be browsed.
    </p>
  {/if}
</section>
