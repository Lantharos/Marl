import type { RepositorySummary } from '@marl/contracts';

export type ShellUser = { id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null };
export type ShellOrganization = { slug: string; name: string; avatarUrl: string | null; kind: 'personal' | 'team'; role: string };
export type ShellData = { user: ShellUser; repositories: RepositorySummary[]; repositoryOwners: ShellOrganization[] };

type Snapshot = { data: ShellData | null; expiresAt: number };
const lifetime = 60_000;
let snapshot: Snapshot | undefined;
let pending: Promise<ShellData | null> | undefined;
let generation = 0;

export function clearShellCache(broadcast = false) {
  if (typeof window === 'undefined') return;
  generation += 1;
  snapshot = undefined;
  pending = undefined;
  if (broadcast && 'BroadcastChannel' in window) {
    const channel = new BroadcastChannel('marl:shell');
    channel.postMessage('invalidate');
    channel.close();
  }
}

export function watchShellChanges(refresh: () => void) {
  if (!('BroadcastChannel' in window)) return () => {};
  const channel = new BroadcastChannel('marl:shell');
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data !== 'invalidate') return;
    clearShellCache();
    refresh();
  };
  return () => channel.close();
}

export function rememberShell(data: ShellData | null) {
  if (typeof window === 'undefined') return;
  generation += 1;
  snapshot = { data, expiresAt: Date.now() + lifetime };
  pending = undefined;
}

export function cachedShell(load: () => Promise<ShellData | null>): Promise<ShellData | null> {
  if (typeof window === 'undefined') return load();
  if (snapshot && snapshot.expiresAt > Date.now()) return Promise.resolve(snapshot.data);
  if (pending) return pending;
  const version = generation;
  const request = load().then((data) => {
    if (generation === version) snapshot = { data, expiresAt: Date.now() + lifetime };
    return data;
  }).finally(() => {
    if (pending === request) pending = undefined;
  });
  pending = request;
  return request;
}

export function changesShell(path: string) {
  const pathname = path.split('?')[0];
  return /^\/profile(?:\/avatar)?$/.test(pathname)
    || /^\/repositories(?:\/[^/]+\/[^/]+(?:\/(?:icon|forks|star|settings(?:\/(?:rename|transfer|detach-fork|delete))?|access(?:\/.*)?))?)?$/.test(pathname)
    || /^\/organizations(?:\/[^/]+(?:\/(?:avatar|access)(?:\/.*)?)?)?$/.test(pathname)
    || /^\/invitations\/[^/]+\/accept$/.test(pathname);
}
