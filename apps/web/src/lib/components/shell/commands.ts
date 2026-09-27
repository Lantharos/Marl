import type { RepositorySummary } from '@marl/contracts';
import type { ShellOrganization, ShellUser } from '$lib/shell-cache';

export type CommandKind =
  | 'home'
  | 'inbox'
  | 'repository'
  | 'organization'
  | 'user'
  | 'commit'
  | 'file'
  | 'issue'
  | 'pull'
  | 'run'
  | 'runner'
  | 'create'
  | 'settings'
  | 'security'
  | 'branch'
  | 'key';
export type Command = { label: string; detail: string; href: string; keywords: string; kind: CommandKind };

export function uniqueCommands(entries: Command[]) {
  const destinations = new Set<string>();
  return entries.filter((command) => {
    if (destinations.has(command.href)) return false;
    destinations.add(command.href);
    return true;
  });
}

export function shellCommands(
  user: ShellUser,
  repositories: RepositorySummary[],
  organizations: ShellOrganization[]
): Command[] {
  return uniqueCommands([
    { label: 'Home', detail: 'Your work across Marl', href: '/', keywords: 'dashboard overview', kind: 'home' },
    {
      label: 'Inbox',
      detail: 'Mentions, assignments, and updates',
      href: '/inbox',
      keywords: 'notifications attention unread',
      kind: 'inbox'
    },
    {
      label: user.displayName,
      detail: `Your public profile · @${user.handle}`,
      href: `/${user.handle}`,
      keywords: 'user account profile activity contributions',
      kind: 'user'
    },
    ...repositories.map((repository) => ({
      label: `${repository.owner}/${repository.name}`,
      detail: repository.description || 'Repository overview',
      href: `/${repository.owner}/${repository.name}`,
      keywords: `repository code ${repository.visibility}`,
      kind: 'repository' as const
    })),
    ...repositories.flatMap((repository) => {
      const base = `/${repository.owner}/${repository.name}`;
      return [
        {
          label: `${repository.owner}/${repository.name} code`,
          detail: 'Browse branches and files',
          href: `${base}/code`,
          keywords: 'repository source tree files',
          kind: 'repository' as const
        },
        {
          label: `${repository.owner}/${repository.name} issues`,
          detail: 'Repository issues',
          href: `${base}/issues`,
          keywords: 'repository bugs tasks work',
          kind: 'issue' as const
        },
        {
          label: `${repository.owner}/${repository.name} pulls`,
          detail: 'Repository pulls',
          href: `${base}/pulls`,
          keywords: 'repository pull requests reviews merge',
          kind: 'pull' as const
        },
        {
          label: `${repository.owner}/${repository.name} runs`,
          detail: 'Repository workflow runs',
          href: `${base}/runs`,
          keywords: 'repository automation jobs checks',
          kind: 'run' as const
        },
        {
          label: `${repository.owner}/${repository.name} settings`,
          detail: 'Repository general settings',
          href: `${base}/settings`,
          keywords: 'repository settings general',
          kind: 'settings' as const
        },
        {
          label: `${repository.owner}/${repository.name} branch rules`,
          detail: 'Protected branches and merge requirements',
          href: `${base}/settings/branches`,
          keywords: 'repository settings branches protection',
          kind: 'branch' as const
        },
        {
          label: `${repository.owner}/${repository.name} access`,
          detail: 'Collaborators and team access',
          href: `${base}/settings/access`,
          keywords: 'repository settings people teams permissions',
          kind: 'security' as const
        },
        {
          label: `${repository.owner}/${repository.name} secrets`,
          detail: 'Repository CI secrets',
          href: `${base}/settings/secrets`,
          keywords: 'repository settings ci environment',
          kind: 'key' as const
        }
      ];
    }),
    {
      label: 'Settings',
      detail: 'Your profile and account',
      href: '/settings/account/profile',
      keywords: 'account preferences profile',
      kind: 'settings'
    },
    {
      label: 'Sign-in and security',
      detail: 'Password, passkeys, and two-factor authentication',
      href: '/settings/account',
      keywords: 'settings account authentication',
      kind: 'security'
    },
    {
      label: 'Sessions',
      detail: 'Devices signed in to your account',
      href: '/settings/account/sessions',
      keywords: 'settings account devices',
      kind: 'security'
    },
    {
      label: 'Developer access',
      detail: 'Personal access tokens',
      href: '/settings/account/tokens',
      keywords: 'settings account api tokens',
      kind: 'key'
    },
    {
      label: 'SSH keys',
      detail: 'Git authentication and commit signing',
      href: '/settings/account/ssh-keys',
      keywords: 'settings developer git signing',
      kind: 'key'
    },
    {
      label: 'Organizations',
      detail: 'Every organization you belong to',
      href: '/organizations',
      keywords: 'teams workspaces settings',
      kind: 'organization'
    },
    ...organizations.flatMap((organization) => {
      const base = `/organizations/${organization.slug}/settings`;
      return [
        {
          label: organization.name,
          detail: `Organization · ${organization.slug}`,
          href: `/${organization.slug}`,
          keywords: `organization public profile ${organization.slug}`,
          kind: 'organization' as const
        },
        {
          label: `${organization.name} settings`,
          detail: 'Organization profile settings',
          href: `${base}/profile`,
          keywords: `organization settings profile ${organization.slug}`,
          kind: 'settings' as const
        },
        {
          label: `${organization.name} people and teams`,
          detail: 'Organization members and default access',
          href: `${base}/access`,
          keywords: `organization settings access ${organization.slug}`,
          kind: 'security' as const
        },
        ...(organization.role === 'member'
          ? []
          : [
              {
                label: `${organization.name} CI secrets`,
                detail: 'Organization workflow secrets',
                href: `${base}/secrets`,
                keywords: `organization settings ci ${organization.slug}`,
                kind: 'key' as const
              }
            ])
      ];
    }),
    {
      label: 'Issues',
      detail: 'Work across your repositories',
      href: '/issues',
      keywords: 'bugs tasks work',
      kind: 'issue'
    },
    {
      label: 'Pulls',
      detail: 'Your review queue',
      href: '/pulls',
      keywords: 'pull requests reviews merge changes',
      kind: 'pull'
    },
    {
      label: 'Runs',
      detail: 'Automation across your code',
      href: '/runs',
      keywords: 'workflows jobs checks',
      kind: 'run'
    },
    {
      label: 'Repositories',
      detail: 'Browse every project',
      href: '/repositories',
      keywords: 'code projects',
      kind: 'repository'
    },
    {
      label: 'Runners',
      detail: 'Connected self-hosted machines',
      href: '/runners',
      keywords: 'machines agents docker',
      kind: 'runner'
    },
    {
      label: 'New repository',
      detail: 'Start a home for your code',
      href: '/repositories/new',
      keywords: 'create',
      kind: 'create'
    },
    {
      label: 'New organization',
      detail: 'Create a shared home for projects',
      href: '/organizations?new=1',
      keywords: 'create team workspace',
      kind: 'organization'
    },
    {
      label: 'New issue',
      detail: 'Track a bug, proposal, or task',
      href: '/issues/new',
      keywords: 'create bug task',
      kind: 'create'
    },
    {
      label: 'New pull',
      detail: 'Put a branch up for review',
      href: '/pulls/new',
      keywords: 'create pull request review',
      kind: 'create'
    },
    {
      label: 'Connect runner',
      detail: 'Add a self-hosted machine',
      href: '/runners/new',
      keywords: 'create machine agent',
      kind: 'create'
    }
  ]);
}

export function matchCommands(commands: Command[], query: string, remote: Command[]) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return commands;
  const local = commands.filter((command) => {
    const haystack = `${command.label} ${command.detail} ${command.keywords}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  return uniqueCommands([...local, ...remote]);
}
