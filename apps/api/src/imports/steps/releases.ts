import { identifier } from '../../core/domain';
import { requestGitGateway } from '../../git/gateway';
import { maximumAssets, normalizeAssetName, normalizeContentType } from '../../releases/assets';
import { downloadReleaseAsset, rewriteReferences, type GitHubUser } from '../github';
import { resolveAuthors } from '../people';
import { pageResult, pullNumbers, timestamp, type StepContext, type StepResult } from './context';

type Asset = {
  id: number;
  url: string;
  name: string;
  size: number;
  content_type: string;
  state: string;
  uploader: GitHubUser;
  created_at: string;
};
type Release = {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  author: GitHubUser;
  created_at: string;
  published_at: string | null;
  assets: Asset[];
};

const maximumAssetBytes = 2 * 1024 * 1024 * 1024;
const bytesPerStep = 512 * 1024 * 1024;

async function tagTargets(context: StepContext) {
  const response = await requestGitGateway(context.env, '/_marl/tags/list', {
    owner: context.row.owner,
    repository: context.row.name
  });
  const { tags } = await response.json<{ tags: Array<{ name: string; targetCommitId: string }> }>();
  return new Map(tags.map((tag) => [tag.name, tag.targetCommitId]));
}

export async function importReleases(context: StepContext): Promise<StepResult> {
  const { env, row, github, importer, repositoryPath, page } = context;
  const releases = await github<Release[]>(`${repositoryPath}/releases?${page}`);
  const [targets, author, numbers] = await Promise.all([
    tagTargets(context),
    resolveAuthors(
      env,
      releases.map((release) => release.author),
      importer
    ),
    pullNumbers(env, row.repositoryId)
  ]);
  const importable = releases.filter((release) => !release.draft && targets.has(release.tag_name));
  if (importable.length)
    await env.DB.batch(
      importable.map((release) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO releases (id,repository_id,tag_name,target_commit_id,name,body,author_id,draft,prerelease,latest,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,0,?,0,?,?,?)'
        ).bind(
          identifier('release'),
          row.repositoryId,
          release.tag_name,
          targets.get(release.tag_name)!,
          release.name ?? '',
          rewriteReferences(release.body, numbers),
          author(release.author),
          release.prerelease ? 1 : 0,
          timestamp(release.created_at),
          timestamp(release.published_at ?? release.created_at),
          timestamp(release.published_at ?? release.created_at)
        )
      )
    );
  const result = pageResult(context, releases.length, { releases: importable.length });
  if (result.step !== 'releases')
    await env.DB.prepare(
      'UPDATE releases SET latest=1 WHERE id=(SELECT id FROM releases WHERE repository_id=? AND draft=0 AND prerelease=0 ORDER BY published_at DESC LIMIT 1)'
    )
      .bind(row.repositoryId)
      .run();
  return result;
}

async function storedAssets(context: StepContext, tags: string[]) {
  if (!tags.length) return new Map<string, { id: string; names: Set<string> }>();
  const rows = await context.env.DB.prepare(
    `SELECT releases.id,releases.tag_name AS tag,release_assets.name FROM releases LEFT JOIN release_assets ON release_assets.release_id=releases.id WHERE releases.repository_id=? AND releases.tag_name IN (${tags.map(() => '?').join(',')})`
  )
    .bind(context.row.repositoryId, ...tags)
    .all<{ id: string; tag: string; name: string | null }>();
  const releases = new Map<string, { id: string; names: Set<string> }>();
  for (const row of rows.results) {
    const release = releases.get(row.tag) ?? { id: row.id, names: new Set<string>() };
    if (row.name) release.names.add(row.name);
    releases.set(row.tag, release);
  }
  return releases;
}

async function storeAsset(context: StepContext, releaseId: string, uploaderId: string, asset: Asset, name: string) {
  const { env, row, token } = context;
  const assetId = identifier('releaseasset');
  const objectKey = `release-assets/${row.repositoryId}/${releaseId}/${assetId}`;
  const contentType = normalizeContentType(asset.content_type);
  const response = await downloadReleaseAsset(token, asset.url);
  const body = new FixedLengthStream(asset.size);
  await Promise.all([
    response.body!.pipeTo(body.writable),
    env.OBJECTS.put(objectKey, body.readable, { httpMetadata: { contentType } })
  ]);
  try {
    await env.DB.prepare(
      'INSERT INTO release_assets (id,release_id,uploader_id,name,object_key,byte_size,content_type,created_at) VALUES (?,?,?,?,?,?,?,?)'
    )
      .bind(assetId, releaseId, uploaderId, name, objectKey, asset.size, contentType, timestamp(asset.created_at))
      .run();
  } catch (error) {
    await env.OBJECTS.delete(objectKey);
    throw error;
  }
}

export async function importReleaseAssets(context: StepContext): Promise<StepResult> {
  const { env, row, github, importer, repositoryPath, page } = context;
  const releases = await github<Release[]>(`${repositoryPath}/releases?${page}`);
  const [stored, author] = await Promise.all([
    storedAssets(
      context,
      releases.map((release) => release.tag_name)
    ),
    resolveAuthors(
      env,
      releases.flatMap((release) => release.assets.map((asset) => asset.uploader)),
      importer
    )
  ]);
  let bytes = 0;
  let imported = 0;
  for (const release of releases) {
    const target = stored.get(release.tag_name);
    if (!target) continue;
    for (const asset of release.assets) {
      const name = normalizeAssetName(asset.name);
      if (
        !name ||
        target.names.has(name) ||
        target.names.size >= maximumAssets ||
        asset.state !== 'uploaded' ||
        asset.size < 1 ||
        asset.size > maximumAssetBytes
      )
        continue;
      if (bytes && bytes + asset.size > bytesPerStep)
        return { step: row.step, cursor: row.cursor, counts: { assets: imported } };
      await storeAsset(context, target.id, author(asset.uploader), asset, name);
      target.names.add(name);
      bytes += asset.size;
      imported += 1;
    }
  }
  return pageResult(context, releases.length, { assets: imported });
}
