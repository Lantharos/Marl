export type ItemKind = 'pull' | 'issue';
export type ItemRef = { kind: ItemKind; owner: string; repo: string; number: number };

const collection = { pull: 'pulls', issue: 'issues' } as const;

export function refKey(ref: ItemRef) {
  return `${ref.kind}:${ref.owner}/${ref.repo}/${ref.number}`;
}

export function itemHref(ref: ItemRef) {
  return `/next/${ref.owner}/${ref.repo}/${collection[ref.kind]}/${ref.number}`;
}

export function reviewHref(ref: ItemRef) {
  return `${itemHref(ref)}/review`;
}

export function itemEndpoint(ref: ItemRef) {
  return `/repositories/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${collection[ref.kind]}/${ref.number}`;
}

export function routeRef(kind: ItemKind, params: { owner: string; repo: string; number: string }): ItemRef {
  return { kind, owner: params.owner, repo: params.repo, number: Number(params.number) };
}

export function workspaceHref(href: string) {
  return /^\/[^/]+\/[^/]+(?:\/(?:pulls|issues)\/\d+|\/(?:tree|blob)\/.+)?$/.test(href) ? `/next${href}` : href;
}

export function repositoryHref(slug: string) {
  return `/next/${slug}`;
}

export function codeRepository(pathname: string) {
  return pathname.match(/^\/next\/([^/]+\/[^/]+)(?:\/(?:tree|blob)\/.*)?$/)?.[1] ?? null;
}

export function currentRepository(url: { pathname: string; searchParams: Pick<URLSearchParams, 'get'> }) {
  return url.searchParams.get('repository') ?? url.pathname.match(/^\/next\/([^/]+\/[^/]+)/)?.[1] ?? null;
}
