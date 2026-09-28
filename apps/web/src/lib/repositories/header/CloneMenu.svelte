<script lang="ts">
  import { resolve } from '$app/paths';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Code2 from '@lucide/svelte/icons/code-xml';
  import Copy from '@lucide/svelte/icons/copy';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from '$lib/components/controls/Button.svelte';
  import { popoverMotion } from '$lib/ui/popover';

  let { cloneUrl, sshCloneUrl, signedIn }: { cloneUrl: string; sshCloneUrl: string | null; signedIn: boolean } =
    $props();
  let open = $state(false);
  let protocol = $state<'https' | 'ssh'>('https');
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const url = $derived(protocol === 'ssh' ? (sshCloneUrl ?? cloneUrl) : cloneUrl);

  async function copy() {
    await navigator.clipboard.writeText(url);
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1600);
  }
</script>

<div class="relative" use:dismissable={() => (open = false)}>
  <Button size="small" aria-label="Clone repository" aria-expanded={open} onclick={() => (open = !open)}
    ><Code2 size={15} /><span class="max-sm:hidden">Clone</span><ChevronDown size={13} /></Button
  >
  {#if open}
    <div
      class="absolute top-10 right-0 z-30 w-[min(380px,calc(100vw-28px))] origin-top-right popover rounded-2xl p-4"
      transition:popoverMotion
    >
      <div class="flex items-center justify-between gap-3">
        <strong class="text-sm font-semibold text-ink-strong">Clone this repository</strong>
        {#if sshCloneUrl}<div class="flex gap-0.5 rounded-lg bg-surface-muted p-0.5">
            {#each ['https', 'ssh'] as const as option (option)}
              <button
                type="button"
                aria-pressed={protocol === option}
                class={[
                  'h-7 rounded-md px-2.5 text-xs font-semibold uppercase transition-colors',
                  protocol === option
                    ? 'bg-surface-raised text-ink-strong shadow-subtle'
                    : 'text-ink-muted hover:text-ink-strong'
                ]}
                onclick={() => {
                  protocol = option;
                  copied = false;
                }}>{option}</button
              >
            {/each}
          </div>{/if}
      </div>
      <p class="mt-2.5 mb-3 text-xs leading-normal text-ink-muted">
        {#if !signedIn && protocol === 'https'}No account needed for a public repository.{:else}{protocol === 'ssh'
            ? 'Uses a public key registered to your Marl account.'
            : 'Use your Marl username and a developer token as the password.'}
          <a
            class="font-semibold text-brand hover:underline"
            href={resolve(protocol === 'ssh' ? '/settings/account/ssh-keys' : '/settings/account/tokens')}
            >{protocol === 'ssh' ? 'Manage SSH keys' : 'Developer access'}</a
          >{/if}
      </p>
      <div class="flex field min-h-0 items-center gap-1 p-0 pl-3">
        <code class="min-w-0 flex-1 truncate py-2.5 font-mono text-xs text-ink">{url}</code>
        <Button icon size="small" variant="ghost" aria-label="Copy clone URL" onclick={copy}
          >{#if copied}<Check size={15} class="text-success" />{:else}<Copy size={15} />{/if}</Button
        >
      </div>
    </div>
  {/if}
</div>
