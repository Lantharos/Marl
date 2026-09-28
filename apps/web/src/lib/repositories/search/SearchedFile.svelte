<script lang="ts">
  import type { CodeSearchFile } from '@marl/contracts';
  import FileCode from '@lucide/svelte/icons/file-code-2';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repositories/repository-path';
  import MatchedLine from './MatchedLine.svelte';

  let {
    file,
    owner,
    repository,
    revision
  }: { file: CodeSearchFile; owner: string; repository: string; revision: string } = $props();
  const href = $derived(`/${owner}/${repository}/blob/${encodeRevision(revision)}/${encodeRepositoryPath(file.path)}`);
  const hidden = $derived(file.matchCount - file.matches.length);
</script>

<article class="overflow-hidden surface">
  <header class="flex items-center gap-2.5 px-4 py-3">
    <FileCode size={15} class="shrink-0 text-ink-muted" />
    <a class="min-w-0 flex-1 truncate font-mono text-sm font-medium text-ink-strong hover:text-brand" {href}
      >{file.path}</a
    >
    <span class="shrink-0 text-xs text-ink-muted tabular-nums"
      >{file.matchCount.toLocaleString()} {file.matchCount === 1 ? 'line' : 'lines'}</span
    >
  </header>
  <div class="overflow-x-auto border-t border-line bg-surface">
    {#each file.matches as match, index (match.line)}
      {#if index > 0 && match.line - file.matches[index - 1].line > 1}
        <div class="h-2 bg-surface-muted/60" aria-hidden="true"></div>
      {/if}
      <a href="{href}#L{match.line}" class="flex min-w-max font-mono text-[13px] leading-6 hover:bg-surface-hover">
        <span class="sticky left-0 w-15.5 shrink-0 bg-surface-muted pr-3 text-right text-ink-faint select-none"
          >{match.line}</span
        >
        <span class="px-3.5 whitespace-pre text-ink"><MatchedLine text={match.text} ranges={match.ranges} /></span>
      </a>
    {/each}
    {#if hidden > 0}
      <a {href} class="block px-4 py-2 text-xs text-ink-muted hover:text-brand"
        >{hidden.toLocaleString()} more {hidden === 1 ? 'line' : 'lines'} in this file</a
      >
    {/if}
  </div>
</article>
