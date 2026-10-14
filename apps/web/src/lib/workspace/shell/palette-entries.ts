import { goto } from '$app/navigation';
import type { Component } from 'svelte';
import type { RepositorySummary } from '@marl/contracts';
import CircleDot from '@lucide/svelte/icons/circle-dot';
import CirclePlay from '@lucide/svelte/icons/circle-play';
import Code from '@lucide/svelte/icons/code-xml';
import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
import Inbox from '@lucide/svelte/icons/inbox';
import { commandIcons } from '#lib/components/shell/commands/command-icons.js';
import type { CommandKind } from '#lib/components/shell/commands/commands.js';
import { repositoryHref, workspaceHref } from '../store/refs';
import type { ShellAction } from './shell-state.svelte';

export type PaletteEntry = {
  key: string;
  section: 'Actions' | 'Go to' | 'Results';
  label: string;
  detail?: string;
  keys?: string;
  icon: Component<{ size?: number; class?: string }>;
  run: () => unknown;
};

type SearchResult = { kind: CommandKind; label: string; detail: string; href: string };

const visit = (href: string) => () => goto(href);

export function actionEntries(actions: ShellAction[]): PaletteEntry[] {
  return actions.map((action) => ({ ...action, key: `action:${action.id}`, section: 'Actions' }));
}

export function destinationEntries(repositories: RepositorySummary[], current: string | null): PaletteEntry[] {
  return [
    ...(current
      ? [
          {
            key: 'go:code',
            section: 'Go to' as const,
            label: 'Code',
            detail: current,
            icon: Code,
            run: visit(repositoryHref(current))
          }
        ]
      : []),
    { key: 'go:inbox', section: 'Go to', label: 'Inbox', icon: Inbox, run: visit('/next') },
    { key: 'go:pulls', section: 'Go to', label: 'Pulls', icon: GitPullRequest, run: visit('/next/pulls') },
    { key: 'go:issues', section: 'Go to', label: 'Issues', icon: CircleDot, run: visit('/next/issues') },
    { key: 'go:runs', section: 'Go to', label: 'Runs', icon: CirclePlay, run: visit('/next/runs') },
    ...repositories.map((repository) => {
      const slug = `${repository.owner}/${repository.name}`;
      return {
        key: `go:${slug}`,
        section: 'Go to' as const,
        label: slug,
        detail: repository.description,
        icon: commandIcons.repository,
        run: visit(repositoryHref(slug))
      };
    })
  ];
}

export function resultEntries(results: SearchResult[]): PaletteEntry[] {
  return results.map((result) => ({
    key: `result:${result.href}`,
    section: 'Results',
    label: result.label,
    detail: result.detail,
    icon: commandIcons[result.kind],
    run: visit(workspaceHref(result.href))
  }));
}

export function matchEntries(entries: PaletteEntry[], query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((entry) => {
    const haystack = `${entry.label} ${entry.detail ?? ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
