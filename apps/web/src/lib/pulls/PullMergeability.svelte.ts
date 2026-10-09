import { api } from '#lib/api.js';

export class PullMergeability {
  conflicted = $state(false);
  checked = $state(false);

  check(route: string, base: string, head: string) {
    const controller = new AbortController();
    this.conflicted = false;
    this.checked = false;
    void api<{ conflicted: boolean }>(`${route}/mergeability?${new URLSearchParams({ base, head })}`, {
      signal: controller.signal
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        this.conflicted = result.conflicted;
        this.checked = true;
      })
      .catch(() => {});
    return () => controller.abort();
  }
}
