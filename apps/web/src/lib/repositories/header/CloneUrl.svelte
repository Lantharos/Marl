<script lang="ts">
  import { resolve } from '$app/paths';
  import { onDestroy } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import Button from '#lib/components/controls/Button.svelte';
  import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';

  let {
    heading,
    description,
    cloneUrl,
    sshCloneUrl,
    signedIn,
    commands
  }: {
    heading: string;
    description?: string;
    cloneUrl: string;
    sshCloneUrl: string;
    signedIn: boolean;
    commands?: (url: string) => string;
  } = $props();
  const protocols = [
    { value: 'https', label: 'HTTPS' },
    { value: 'ssh', label: 'SSH' }
  ] as const;
  let protocol = $state<'https' | 'ssh'>('https');
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const url = $derived(protocol === 'ssh' ? sshCloneUrl : cloneUrl);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1600);
  }

  onDestroy(() => clearTimeout(timer));
</script>

{#snippet copyButton(text: string, label: string, className = '')}
  <Button icon size="small" variant="ghost" class={className} aria-label={label} onclick={() => copy(text)}
    >{#if copied}<Check size={15} class="text-success" />{:else}<Copy size={15} />{/if}</Button
  >
{/snippet}

<div class="flex flex-wrap items-center justify-between gap-3">
  <div class="min-w-0">
    <strong class="block text-sm font-semibold text-ink-strong">{heading}</strong>
    {#if description}<span class="mt-0.5 block text-xs text-ink-muted">{description}</span>{/if}
  </div>
  <SegmentedControl label="Git protocol" options={protocols} bind:value={protocol} onchange={() => (copied = false)} />
</div>
{#if commands}
  <div class="relative mt-2.5 rounded-lg bg-surface-muted">
    <pre class="overflow-x-auto py-3.5 pr-12 pl-4 font-mono text-[13px] leading-[1.75] text-ink-strong"><code
        >{commands(url)}</code
      ></pre>
    {@render copyButton(commands(url), 'Copy push commands', 'absolute top-2 right-2')}
  </div>
{:else}
  <div class="mt-3 flex field min-h-0 items-center gap-1 p-0 pl-3">
    <code class="min-w-0 flex-1 truncate py-2.5 font-mono text-xs text-ink">{url}</code>
    {@render copyButton(url, 'Copy clone URL')}
  </div>
{/if}
<p class="mt-2.5 text-xs leading-normal text-ink-muted [&_a]:font-semibold [&_a]:text-brand [&_a:hover]:underline">
  {#if protocol === 'ssh'}
    Uses a public key added under <a href={resolve('/settings/account/ssh-keys')}>SSH keys</a>.
  {:else if signedIn}
    Use your Marl username and a <a href={resolve('/settings/account/tokens')}>developer token</a> as the password.
  {:else}
    No account needed for a public repository.
  {/if}
</p>
