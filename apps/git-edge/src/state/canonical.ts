export async function promoteCanonicalObject(bucket: R2Bucket, sourceKey: string, canonicalKey: string, expectedBytes: number | null, contentType: string) {
  const existing = await bucket.head(canonicalKey);
  if (existing) {
    assertStoredObject(canonicalKey, existing, expectedBytes);
    return false;
  }
  const source = await bucket.get(sourceKey);
  if (!source) throw new Error(`Quarantine object ${sourceKey} is missing.`);
  try {
    await bucket.put(canonicalKey, source.body, { httpMetadata: { contentType } });
  } catch (error) {
    const recovered = await bucket.head(canonicalKey).catch(() => null);
    if (!recovered) throw error;
    assertStoredObject(canonicalKey, recovered, expectedBytes);
  }
  const stored = await bucket.head(canonicalKey);
  if (!stored) throw new Error(`Canonical object ${canonicalKey} is missing after storage acknowledged it.`);
  assertStoredObject(canonicalKey, stored, expectedBytes);
  return true;
}

function assertStoredObject(key: string, object: R2Object, expectedBytes: number | null) {
  if (object.size === 0 || (expectedBytes !== null && object.size !== expectedBytes)) throw new Error(`Canonical object ${key} has an unexpected size.`);
}
