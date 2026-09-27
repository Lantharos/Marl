import { array, boolean, integer, maxLength, minLength, minValue, nullable, number, optional, pipe, record, regex, strictObject, string, union } from 'valibot';

const identifier = pipe(string(), minLength(1), maxLength(4_096));
const nonNegativeInteger = pipe(number(), integer(), minValue(0));
const positiveInteger = pipe(number(), integer(), minValue(1));
const gitHash = pipe(string(), regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/));
const refs = record(string(), gitHash);
const expectedRefs = record(string(), nullable(gitHash));
const uploadPack = strictObject({ bytes: positiveInteger, parts: positiveInteger, key: identifier });
const canonicalPack = strictObject({
  id: pipe(string(), regex(/^[0-9a-f]{40,64}$/)),
  packKey: identifier,
  indexKey: identifier,
  objectIndexKey: identifier,
  compressedBytes: nonNegativeInteger,
  expandedBytes: nonNegativeInteger,
  objectCount: nonNegativeInteger,
  largestBlobBytes: nonNegativeInteger
});
export const repositoryManifest = strictObject({ generation: nonNegativeInteger, refsVersion: nonNegativeInteger, refs, packs: array(canonicalPack) });

export const beginPushBody = strictObject({ pushId: identifier, reservationId: identifier, expiresAt: positiveInteger, proposedRefs: refs, expectedRefs });
export const publishBody = strictObject({ pushId: identifier, expectedGeneration: nonNegativeInteger, refs, manifestKey: identifier, manifestHash: pipe(string(), regex(/^[0-9a-f]{64}$/)), packs: array(canonicalPack) });
export const forkStateBody = strictObject({ refs, manifestKey: identifier, manifestHash: pipe(string(), regex(/^[0-9a-f]{64}$/)), packs: array(canonicalPack) });
export const proposePushBody = strictObject({ pushId: identifier, refs });
export const pushIdBody = strictObject({ pushId: identifier });

export const reserveStorageBody = strictObject({ id: identifier, repository: identifier, maximumBytes: nonNegativeInteger, expiresAt: positiveInteger });
export const settleStorageBody = strictObject({ id: identifier, actualBytes: nonNegativeInteger });
export const releaseStorageBody = strictObject({ id: identifier });
export const adjustStorageBody = strictObject({ id: identifier, deltaBytes: pipe(number(), integer()) });

export const initializeUploadBody = strictObject({ pushId: identifier, repository: identifier, organizationId: identifier, expiresAt: positiveInteger, expectedGeneration: nonNegativeInteger, refs, packs: array(uploadPack) });
export const attachUploadBody = strictObject({ pack: nonNegativeInteger, uploadId: identifier });
export const claimPartBody = strictObject({ pack: nonNegativeInteger, part: positiveInteger, bytes: positiveInteger });
export const completePartBody = strictObject({ pack: nonNegativeInteger, part: positiveInteger, etag: identifier });
export const failPartBody = strictObject({ pack: nonNegativeInteger, part: positiveInteger });
export const prepareServerUploadBody = strictObject({ refs, packs: array(uploadPack) });
export const trackCleanupBody = union([strictObject({ key: identifier }), strictObject({ keys: pipe(array(identifier), minLength(1)) })]);
export const emptyBody = strictObject({});

export const nativePushBody = strictObject({ expectedRefs, refs, packs: pipe(array(strictObject({ bytes: positiveInteger })), maxLength(4)) });
export const repositoryIndexTaskBody = strictObject({ owner: identifier, repository: identifier, repositoryId: identifier, generation: nonNegativeInteger, actorId: optional(identifier) });
export const compactionTaskBody = strictObject({ owner: identifier, repository: identifier, repositoryId: identifier, organizationId: identifier, generation: nonNegativeInteger, force: optional(boolean()) });
