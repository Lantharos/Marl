import { searchRepositoryCode } from './search/code-search';
import { sourcePreview } from '../git/source-preview';
import { route } from '../http/router';
import {
  deleteRepositoryCollaborator,
  deleteRepositoryTeamGrant,
  getRepositoryAccess,
  putRepositoryCollaborator,
  searchCollaboratorCandidates,
  putRepositoryTeamGrant
} from './access/access-api';
import { listBranchRules, putBranchRule } from './branch-rules';
import { deleteBranch } from './branches';
import { downloadRepositoryBundle } from './content/bundle';
import { renderRepositoryDocument } from './content/documents';
import { listDeletedRepositories, restoreRepository } from './lifecycle';
import { readRepositoryMedia, uploadRepositoryMedia } from './content/media';
import {
  createRepository,
  getRepository,
  listRepositories,
  readRepositoryIcon,
  setRepositoryStar,
  uploadRepositoryIcon
} from './repositories';
import { detachRepositoryFork, forkRepository } from './forks';
import {
  getCommit,
  listBranches,
  listCommits,
  listPullSources,
  listTree,
  readBlob,
  readCommitPatch
} from './content/source';
import { getRepositoryOverview, updateRepositoryOverview } from './content/overview';
import {
  getRepositorySettings,
  renameRepository,
  scheduleRepositoryDeletion,
  transferRepository,
  updateRepositorySettings
} from './settings';

const repository = '/repositories/:owner/:repo';

export const repositoryRoutes = [
  route('GET', '/repository-icons/:repository/:file', 'public', ({ env }, { repository, file }) =>
    readRepositoryIcon(env, repository, file)
  ),
  route(['GET', 'HEAD'], '/media/:id(media_[a-z0-9]+)', 'optional', ({ request, env, principal }, { id }) =>
    readRepositoryMedia(request, env, principal, id)
  ),
  route('GET', '/repositories', 'user', ({ env, principal, url }) => listRepositories(env, principal, url)),
  route('POST', '/repositories', 'user', ({ request, env, principal }) => createRepository(request, env, principal)),
  route('GET', '/repositories/deleted', 'user', ({ env, principal }) => listDeletedRepositories(env, principal)),
  route('GET', repository, 'optional', ({ env, principal }, { owner, repo }) =>
    getRepository(env, principal, owner, repo)
  ),
  route('GET', `${repository}/overview`, 'optional', ({ env, principal }, { owner, repo }) =>
    getRepositoryOverview(env, principal, owner, repo)
  ),
  route('PUT', `${repository}/overview`, 'user', ({ request, env, principal }, { owner, repo }) =>
    updateRepositoryOverview(request, env, principal, owner, repo)
  ),
  route('GET', `${repository}/branches`, 'optional', ({ env, principal }, { owner, repo }) =>
    listBranches(env, principal, owner, repo)
  ),
  route('DELETE', `${repository}/branches/*branch`, 'user', ({ request, env, principal }, { owner, repo, branch }) =>
    deleteBranch(request, env, principal, owner, repo, branch)
  ),
  route('GET', `${repository}/commits`, 'optional', ({ env, principal, url }, { owner, repo }) =>
    listCommits(env, principal, owner, repo, url)
  ),
  route('GET', `${repository}/commits/:commit/patch`, 'optional', ({ env, principal, url }, { owner, repo, commit }) =>
    readCommitPatch(env, principal, owner, repo, commit, url)
  ),
  route('GET', `${repository}/commits/:commit`, 'optional', ({ env, principal }, { owner, repo, commit }) =>
    getCommit(env, principal, owner, repo, commit)
  ),
  route('GET', `${repository}/tree`, 'optional', ({ env, principal, url }, { owner, repo }) =>
    listTree(env, principal, owner, repo, url)
  ),
  route('GET', `${repository}/blob/:revision/*path`, 'optional', ({ env, principal, execution }, params) =>
    readBlob(env, principal, params.owner, params.repo, params.revision, params.path, execution)
  ),
  route('GET', `${repository}/source/:revision/*path`, 'optional', ({ env, principal, execution }, params) =>
    sourcePreview(env, principal, params.owner, params.repo, params.revision, params.path, execution)
  ),
  route('GET', `${repository}/document/:revision/*path`, 'optional', ({ env, principal, execution }, params) =>
    renderRepositoryDocument(env, principal, params.owner, params.repo, params.revision, params.path, execution)
  ),
  route('POST', `${repository}/media`, 'user', ({ request, env, principal }, { owner, repo }) =>
    uploadRepositoryMedia(request, env, principal, owner, repo)
  ),
  route('PUT', `${repository}/icon`, 'user', ({ request, env, principal }, { owner, repo }) =>
    uploadRepositoryIcon(request, env, principal, owner, repo)
  ),
  route('PUT', `${repository}/star`, 'user', ({ env, principal }, { owner, repo }) =>
    setRepositoryStar(env, principal, owner, repo, true)
  ),
  route('DELETE', `${repository}/star`, 'user', ({ env, principal }, { owner, repo }) =>
    setRepositoryStar(env, principal, owner, repo, false)
  ),
  route('POST', `${repository}/forks`, 'user', ({ request, env, principal }, { owner, repo }) =>
    forkRepository(request, env, principal, owner, repo)
  ),
  route('GET', `${repository}/pull-sources`, 'user', ({ env, principal }, { owner, repo }) =>
    listPullSources(env, principal, owner, repo)
  ),
  route('GET', `${repository}/branch-rules`, 'user', ({ env, principal }, { owner, repo }) =>
    listBranchRules(env, principal, owner, repo)
  ),
  route('PUT', `${repository}/branch-rules`, 'user', ({ request, env, principal }, { owner, repo }) =>
    putBranchRule(request, env, principal, owner, repo)
  ),
  route('GET', `${repository}/settings`, 'user', ({ env, principal }, { owner, repo }) =>
    getRepositorySettings(env, principal, owner, repo)
  ),
  route('PATCH', `${repository}/settings`, 'user', ({ request, env, principal }, { owner, repo }) =>
    updateRepositorySettings(request, env, principal, owner, repo)
  ),
  route('POST', `${repository}/settings/rename`, 'user', ({ request, env, principal }, { owner, repo }) =>
    renameRepository(request, env, principal, owner, repo)
  ),
  route('POST', `${repository}/settings/transfer`, 'user', ({ request, env, principal }, { owner, repo }) =>
    transferRepository(request, env, principal, owner, repo)
  ),
  route('POST', `${repository}/settings/detach-fork`, 'user', ({ request, env, principal }, { owner, repo }) =>
    detachRepositoryFork(request, env, principal, owner, repo)
  ),
  route('POST', `${repository}/settings/delete`, 'user', ({ request, env, principal }, { owner, repo }) =>
    scheduleRepositoryDeletion(request, env, principal, owner, repo)
  ),
  route('POST', `${repository}/settings/restore`, 'user', ({ request, env, principal }, { owner, repo }) =>
    restoreRepository(request, env, principal, owner, repo)
  ),
  route('GET', `${repository}/search/code`, 'optional', ({ env, principal, url }, { owner, repo }) =>
    searchRepositoryCode(env, principal, owner, repo, url)
  ),
  route('GET', `${repository}/bundle`, 'optional', ({ env, principal }, { owner, repo }) =>
    downloadRepositoryBundle(env, principal, owner, repo)
  ),
  route('GET', `${repository}/access`, 'user', ({ env, principal }, { owner, repo }) =>
    getRepositoryAccess(env, principal, owner, repo)
  ),
  route('GET', `${repository}/access/candidates`, 'user', ({ env, principal, url }, { owner, repo }) =>
    searchCollaboratorCandidates(env, principal, owner, repo, url.searchParams.get('q') ?? '')
  ),
  route('PUT', `${repository}/access/collaborators`, 'user', ({ request, env, principal }, { owner, repo }) =>
    putRepositoryCollaborator(request, env, principal, owner, repo)
  ),
  route('DELETE', `${repository}/access/collaborators/:user`, 'user', ({ request, env, principal }, params) =>
    deleteRepositoryCollaborator(request, env, principal, params.owner, params.repo, params.user)
  ),
  route('PUT', `${repository}/access/teams`, 'user', ({ request, env, principal }, { owner, repo }) =>
    putRepositoryTeamGrant(request, env, principal, owner, repo)
  ),
  route('DELETE', `${repository}/access/teams/:team`, 'user', ({ request, env, principal }, params) =>
    deleteRepositoryTeamGrant(request, env, principal, params.owner, params.repo, params.team)
  )
];
