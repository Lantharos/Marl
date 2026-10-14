<script lang="ts">
  import ConfirmDialog from '#lib/components/overlays/ConfirmDialog.svelte';
  import type { Discussion } from './discussion.svelte';

  let { discussion }: { discussion: Discussion } = $props();
</script>

<ConfirmDialog
  open={discussion.removal !== null}
  title={discussion.removal?.title ?? ''}
  confirmLabel="Delete"
  busy={discussion.removing}
  onConfirm={discussion.confirmRemoval}
  onClose={() => (discussion.removal = null)}>{discussion.removal?.message}</ConfirmDialog
>
