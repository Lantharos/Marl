<script lang="ts">
  import Kbd from '#lib/components/page/Kbd.svelte';
  import Modal from '#lib/components/overlays/Modal.svelte';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();
  const groups = [
    {
      title: 'Anywhere',
      keys: [
        [['Ctrl', 'K'], 'Jump to anything or run an action'],
        [[']'], 'Show or hide details'],
        [['?'], 'Show these shortcuts']
      ]
    },
    {
      title: 'Inbox',
      keys: [
        [['J', 'K'], 'Open the next or previous item'],
        [['E'], 'Mark done'],
        [['Z'], 'Undo mark done'],
        [['U'], 'Mark read or unread'],
        [['Enter'], 'Move into the item'],
        [['Esc'], 'Back to the list']
      ]
    },
    { title: 'Pulls', keys: [[['R'], 'Start reviewing']] },
    {
      title: 'Review',
      keys: [
        [['N', 'P'], 'Next or previous file'],
        [['J', 'K'], 'Next or previous change or conversation'],
        [['↑', '↓'], 'Move between lines'],
        [['C'], 'Comment on the current line'],
        [['V'], 'Mark the file viewed'],
        [['A'], 'Approve'],
        [['Ctrl', 'Enter'], 'Submit the review'],
        [['Esc'], 'Leave review']
      ]
    }
  ] as const;
</script>

<Modal {open} title="Keyboard shortcuts" size="large" {onClose}>
  <div class="grid gap-6 sm:grid-cols-2">
    {#each groups as group (group.title)}
      <section>
        <h3 class="mb-2 text-sm font-semibold text-ink-strong">{group.title}</h3>
        <dl class="grid gap-1.5">
          {#each group.keys as [keys, description] (description)}
            <div class="flex items-center justify-between gap-4 text-sm">
              <dt class="text-ink-muted">{description}</dt>
              <dd class="flex shrink-0 gap-1">
                {#each keys as key (key)}<Kbd>{key}</Kbd>{/each}
              </dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
</Modal>
