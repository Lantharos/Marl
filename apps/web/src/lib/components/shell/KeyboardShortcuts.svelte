<script lang="ts">
  import Modal from '../overlays/Modal.svelte';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();
  const groups = [
    {
      title: 'Everywhere',
      shortcuts: [
        { keys: ['Ctrl', 'K'], label: 'Search and jump anywhere' },
        { keys: ['?'], label: 'Show keyboard shortcuts' }
      ]
    },
    { title: 'Code', shortcuts: [{ keys: ['T'], label: 'Go to file' }] },
    {
      title: 'Pulls',
      shortcuts: [
        { keys: ['1', '–', '4'], label: 'Overview, changes, commits, checks' },
        { keys: ['J'], label: 'Next changed file' },
        { keys: ['K'], label: 'Previous changed file' },
        { keys: ['N'], label: 'Next open conversation' },
        { keys: ['P'], label: 'Previous open conversation' },
        { keys: ['C'], label: 'Write a comment' },
        { keys: ['R'], label: 'Review changes' },
        { keys: ['Ctrl', 'Enter'], label: 'Submit the comment you are writing' }
      ]
    }
  ];
</script>

<Modal {open} title="Keyboard shortcuts" {onClose}>
  <div class="grid gap-6">
    {#each groups as group (group.title)}
      <section>
        <h3 class="mb-2 text-sm font-semibold text-ink-strong">{group.title}</h3>
        <dl class="grid gap-1">
          {#each group.shortcuts as shortcut (shortcut.label)}
            <div class="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 even:bg-surface-muted/60">
              <dt class="text-sm text-ink">{shortcut.label}</dt>
              <dd class="flex shrink-0 items-center gap-1">
                {#each shortcut.keys as key, index (index)}
                  {#if key === '–'}<span class="text-xs text-ink-faint">to</span>{:else}<kbd
                      class="min-w-6 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-sans text-xs text-ink-strong shadow-subtle"
                      >{key}</kbd
                    >{/if}
                {/each}
              </dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
</Modal>
