import type { GitEdgeEnv } from './env';
import { repositoryState, StateRequestError, type RepositorySnapshotResponse } from './state-client';
import type { CatalogObject } from './repository-state-store';

type Locator = { id: string; packId: string; packKey: string; kind: string; size: number; packedBytes: number; offset: number };
type PackedObject = { kind: string; bytes: Uint8Array };

export async function readPackedObject(env: GitEdgeEnv, repository: string, objectId: string): Promise<PackedObject> {
  const state = repositoryState(env, repository);
  let locator: Locator;
  try {
    ({ locator } = await state.request<{ locator: Locator }>(`/objects/${objectId}`));
  } catch (error) {
    if (!(error instanceof StateRequestError) || error.status !== 404) throw error;
    await repairCatalog(env, state);
    ({ locator } = await state.request<{ locator: Locator }>(`/objects/${objectId}`));
  }
  return unpack(env, state, locator, new Set(), 0);
}

async function repairCatalog(env: GitEdgeEnv, state: ReturnType<typeof repositoryState>) {
  const [{ state: snapshot }, { catalogs }] = await Promise.all([
    state.request<RepositorySnapshotResponse>('/snapshot'),
    state.request<{ catalogs: Array<{ packId: string; objectCount: number; catalogCount: number }> }>('/catalogs')
  ]);
  const counts = new Map(catalogs.map((catalog) => [catalog.packId, catalog]));
  for (const pack of snapshot.packs) {
    const count = counts.get(pack.id);
    if (count?.catalogCount === pack.objectCount) continue;
    const stored = await env.REPOSITORIES.get(pack.objectIndexKey);
    if (!stored) throw new Error(`Canonical object index ${pack.id} is missing.`);
    const objects = await stored.json<CatalogObject[]>();
    if (!Array.isArray(objects) || objects.length !== pack.objectCount) throw new Error(`Canonical object index ${pack.id} is invalid.`);
    for (let offset = 0; offset < objects.length; offset += 500) await state.request('/catalog', { packId: pack.id, objects: objects.slice(offset, offset + 500) });
  }
}

async function unpack(env: GitEdgeEnv, state: ReturnType<typeof repositoryState>, locator: Locator, visiting: Set<string>, depth: number): Promise<PackedObject> {
  if (depth > 64 || visiting.has(`${locator.packId}:${locator.offset}`)) throw new Error('Git delta chain is cyclic or too deep.');
  visiting.add(`${locator.packId}:${locator.offset}`);
  const stored = await env.REPOSITORIES.get(locator.packKey, { range: { offset: locator.offset, length: locator.packedBytes } });
  if (!stored) throw new Error(`Git pack ${locator.packId} is missing.`);
  const packed = new Uint8Array(await stored.arrayBuffer());
  const header = parseHeader(packed);
  let base: PackedObject | null = null;
  let contentOffset = header.bytes;
  if (header.type === 6) {
    const distance = parseOffsetDistance(packed, contentOffset);
    contentOffset += distance.bytes;
    const baseOffset = locator.offset - distance.value;
    if (baseOffset < 12) throw new Error('Git OFS delta points outside its pack.');
    const found = await state.request<{ locator: Locator }>(`/packs/${locator.packId}/offsets/${baseOffset}`);
    base = await unpack(env, state, found.locator, visiting, depth + 1);
  } else if (header.type === 7) {
    const hashBytes = locator.id.length / 2;
    if (contentOffset + hashBytes > packed.length) throw new Error('Git REF delta base is truncated.');
    const baseId = [...packed.subarray(contentOffset, contentOffset + hashBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    contentOffset += hashBytes;
    const found = await state.request<{ locator: Locator }>(`/objects/${baseId}`);
    base = await unpack(env, state, found.locator, visiting, depth + 1);
  }
  const inflated = await inflate(packed.subarray(contentOffset));
  const bytes = base ? applyDelta(base.bytes, inflated) : inflated;
  if (bytes.byteLength !== locator.size) throw new Error(`Git object ${locator.id} expanded to an unexpected size.`);
  visiting.delete(`${locator.packId}:${locator.offset}`);
  return { kind: base?.kind ?? kind(header.type, locator.kind), bytes };
}

function parseHeader(bytes: Uint8Array) {
  if (!bytes.length) throw new Error('Git object header is empty.');
  let byte = bytes[0];
  const type = (byte >> 4) & 7;
  let size = byte & 15;
  let shift = 4;
  let offset = 1;
  while (byte & 128) {
    if (offset >= bytes.length || shift > 53) throw new Error('Git object header is invalid.');
    byte = bytes[offset++];
    size += (byte & 127) * 2 ** shift;
    shift += 7;
  }
  return { type, size, bytes: offset };
}

function parseOffsetDistance(bytes: Uint8Array, start: number) {
  if (start >= bytes.length) throw new Error('Git OFS delta header is truncated.');
  let byte = bytes[start];
  let value = byte & 127;
  let offset = start + 1;
  while (byte & 128) {
    if (offset >= bytes.length || value > Number.MAX_SAFE_INTEGER >> 7) throw new Error('Git OFS delta distance is invalid.');
    byte = bytes[offset++];
    value = (value + 1) * 128 + (byte & 127);
  }
  return { value, bytes: offset - start };
}

async function inflate(bytes: Uint8Array) {
  const stream = new Blob([new Uint8Array(bytes).buffer]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function applyDelta(base: Uint8Array, delta: Uint8Array) {
  let cursor = 0;
  const baseSize = readVariableInteger(delta, cursor); cursor = baseSize.cursor;
  const resultSize = readVariableInteger(delta, cursor); cursor = resultSize.cursor;
  if (baseSize.value !== base.byteLength || resultSize.value > 100 * 1024 * 1024) throw new Error('Git delta declares an invalid object size.');
  const output = new Uint8Array(resultSize.value);
  let written = 0;
  while (cursor < delta.length) {
    const instruction = delta[cursor++];
    if (instruction & 128) {
      let offset = 0;
      let size = 0;
      if (instruction & 1) offset |= delta[cursor++];
      if (instruction & 2) offset |= delta[cursor++] << 8;
      if (instruction & 4) offset |= delta[cursor++] << 16;
      if (instruction & 8) offset += delta[cursor++] * 2 ** 24;
      if (instruction & 16) size |= delta[cursor++];
      if (instruction & 32) size |= delta[cursor++] << 8;
      if (instruction & 64) size |= delta[cursor++] << 16;
      if (size === 0) size = 65_536;
      if (offset + size > base.length || written + size > output.length) throw new Error('Git delta copy exceeds its object bounds.');
      output.set(base.subarray(offset, offset + size), written); written += size;
    } else {
      if (instruction === 0 || cursor + instruction > delta.length || written + instruction > output.length) throw new Error('Git delta insert exceeds its object bounds.');
      output.set(delta.subarray(cursor, cursor + instruction), written); cursor += instruction; written += instruction;
    }
  }
  if (written !== output.length) throw new Error('Git delta result is truncated.');
  return output;
}

function readVariableInteger(bytes: Uint8Array, start: number) {
  let value = 0;
  let shift = 0;
  let cursor = start;
  while (cursor < bytes.length) {
    const byte = bytes[cursor++];
    value += (byte & 127) * 2 ** shift;
    if (!(byte & 128)) return { value, cursor };
    shift += 7;
    if (shift > 53) break;
  }
  throw new Error('Git delta integer is invalid.');
}

function kind(type: number, expected: string) {
  const value = ['', 'commit', 'tree', 'blob', 'tag'][type];
  if (!value || value !== expected) throw new Error('Git object type does not match its validated catalog.');
  return value;
}
