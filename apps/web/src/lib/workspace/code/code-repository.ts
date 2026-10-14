import type { RepositoryPermissions, RepositorySummary } from '@marl/contracts';
import { codeLinks, type CodeLocation } from '#lib/repositories/browser/entry-path.js';

export type CodeRepository = RepositorySummary & {
  defaultBranch: string;
  cloneUrl: string;
  sshCloneUrl: string;
  permissions: RepositoryPermissions;
};

export const workspaceLinks = codeLinks('/next', '');

export function codeLocation(repository: CodeRepository, revision = repository.defaultBranch): CodeLocation {
  return { owner: repository.owner, repository: repository.name, revision, defaultBranch: repository.defaultBranch };
}
