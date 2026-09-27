import { route } from '../http/router';
import {
  abortReleaseAssetUpload,
  beginReleaseAssetUpload,
  completeReleaseAssetUpload,
  deleteReleaseAsset,
  downloadReleaseAsset,
  uploadReleaseAssetPart
} from './assets';
import {
  createRelease,
  deleteRelease,
  downloadReleaseArchive,
  getRelease,
  getReleaseByTag,
  listReleases,
  listRepositoryTags,
  updateRelease
} from './releases';

const releases = '/repositories/:owner/:repo/releases';
const release = `${releases}/:id(release_[a-z0-9]+)`;
const upload = '/release-asset-uploads/:id(releaseupload_[a-z0-9]+)';
const asset = '/release-assets/:id(releaseasset_[a-z0-9]+)';

export const releaseRoutes = [
  route('GET', releases, 'optional', ({ env, principal, url }, { owner, repo }) =>
    listReleases(env, principal, owner, repo, url)
  ),
  route('POST', releases, 'user', ({ request, env, principal }, { owner, repo }) =>
    createRelease(request, env, principal, owner, repo)
  ),
  route('GET', `${releases}/by-tag`, 'optional', ({ env, principal, url }, { owner, repo }) =>
    getReleaseByTag(env, principal, owner, repo, url)
  ),
  route('GET', `${releases}/tags`, 'optional', ({ env, principal }, { owner, repo }) =>
    listRepositoryTags(env, principal, owner, repo)
  ),
  route('GET', release, 'optional', ({ env, principal }, { owner, repo, id }) =>
    getRelease(env, principal, owner, repo, id)
  ),
  route('PATCH', release, 'user', ({ request, env, principal }, { owner, repo, id }) =>
    updateRelease(request, env, principal, owner, repo, id)
  ),
  route('DELETE', release, 'user', ({ env, principal }, { owner, repo, id }) =>
    deleteRelease(env, principal, owner, repo, id)
  ),
  route('GET', `${release}/archive/:format(zip|tar\\.gz)`, 'optional', ({ env, principal }, params) =>
    downloadReleaseArchive(env, principal, params.owner, params.repo, params.id, params.format as 'zip' | 'tar.gz')
  ),
  route('POST', `${release}/asset-uploads`, 'user', ({ request, env, principal }, { owner, repo, id }) =>
    beginReleaseAssetUpload(request, env, principal, owner, repo, id)
  ),
  route('PUT', `${upload}/parts/:part(\\d+)`, 'user', ({ request, env, principal }, { id, part }) =>
    uploadReleaseAssetPart(request, env, principal, id, Number(part))
  ),
  route('POST', `${upload}/complete`, 'user', ({ env, principal }, { id }) =>
    completeReleaseAssetUpload(env, principal, id)
  ),
  route('DELETE', upload, 'user', ({ env, principal }, { id }) => abortReleaseAssetUpload(env, principal, id)),
  route('GET', `${asset}/download`, 'optional', ({ env, principal }, { id }) =>
    downloadReleaseAsset(env, principal, id)
  ),
  route('DELETE', asset, 'user', ({ env, principal }, { id }) => deleteReleaseAsset(env, principal, id))
];
