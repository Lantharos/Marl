import type { ThreadCodeLine } from '$lib/diff';

export class ReviewThreadState {
  replyBody = $state('');
  replying = $state(false);
  editing = $state<string | null>(null);
  editBody = $state('');
  confirmingDelete = $state<string | null>(null);
  resolvedOpen = $state(false);
  codeLines = $state<ThreadCodeLine[]>([]);
  contextLoading = $state(false);
}
