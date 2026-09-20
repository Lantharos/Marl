import { api } from '$lib/api';

export class PullMergeability {
  conflicted = $state(false);

  check(route: string, base: string, head: string) {
    const controller = new AbortController();
    this.conflicted = false;
    void api<{ conflicted: boolean }>(`${route}/mergeability?${new URLSearchParams({ base, head })}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) this.conflicted = result.conflicted; })
      .catch(() => {});
    return () => controller.abort();
  }
}
