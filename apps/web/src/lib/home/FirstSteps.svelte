<script lang="ts">
  import type { OnboardingProgress, OnboardingStep } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import X from '@lucide/svelte/icons/x';
  import { api } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';

  let { steps }: { steps: OnboardingProgress[] } = $props();
  let dismissed = $state(false);
  const copy: Record<OnboardingStep, { title: string; description: string; href: string }> = {
    repository: {
      title: 'Create or import a repository',
      description: 'Start fresh, or bring a project over from GitHub with its history and issues.',
      href: '/repositories/new'
    },
    push: {
      title: 'Push your first commit',
      description: 'Copy the clone URL from a repository and push with plain Git.',
      href: '/repositories'
    },
    teammate: {
      title: 'Invite a collaborator',
      description: 'Add people to a repository, or create an organization for your team.',
      href: '/organizations'
    },
    pull: {
      title: 'Open a pull',
      description: 'Propose a change from a branch and review it together.',
      href: '/pulls/new'
    },
    runner: {
      title: 'Connect a runner',
      description: 'Run checks on your own machine with a self-hosted runner.',
      href: '/runners/new'
    }
  };
  const completed = $derived(steps.filter((step) => step.done).length);
  const next = $derived(steps.find((step) => !step.done)?.id);

  function dismiss() {
    dismissed = true;
    void api('/onboarding/dismiss', { method: 'POST', body: '{}' });
  }
</script>

{#if !dismissed}
  <section class="surface p-4 sm:p-5" aria-labelledby="first-steps">
    <header class="mb-3 flex items-start justify-between gap-4">
      <div>
        <h2 id="first-steps" class="text-base font-semibold text-ink-strong">Get set up</h2>
        <p class="mt-0.5 text-sm text-ink-muted">{completed} of {steps.length} done</p>
      </div>
      <Button icon size="small" variant="ghost" aria-label="Hide setup steps" onclick={dismiss}><X size={15} /></Button>
    </header>
    <div class="mb-3 h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
      <div
        class="h-full rounded-full bg-brand transition-[width]"
        style:width="{(completed / steps.length) * 100}%"
      ></div>
    </div>
    <ol class="grid gap-0.5">
      {#each steps as step (step.id)}
        <li>
          <a
            href={copy[step.id].href}
            class={[
              'group grid grid-cols-[22px_minmax(0,1fr)_14px] items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-surface-hover',
              step.id === next && 'bg-surface-muted'
            ]}
          >
            <span
              class={[
                'grid size-5.5 place-items-center rounded-full border',
                step.done ? 'border-success bg-success text-white' : 'border-line-strong'
              ]}
              >{#if step.done}<Check size={13} strokeWidth={2.6} />{/if}</span
            >
            <span class="min-w-0">
              <strong
                class={['block text-sm font-semibold', step.done ? 'text-ink-muted line-through' : 'text-ink-strong']}
                >{copy[step.id].title}</strong
              >
              {#if step.id === next}<span class="mt-0.5 block text-xs text-ink-muted">{copy[step.id].description}</span
                >{/if}
            </span>
            <ChevronRight size={14} class="text-ink-faint group-hover:text-brand" />
          </a>
        </li>
      {/each}
    </ol>
  </section>
{/if}
