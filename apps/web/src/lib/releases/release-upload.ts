import type { ApiError, ReleaseAsset } from '@marl/contracts';
import { api, MarlApiError } from '$lib/api';

export async function uploadReleaseAsset(owner: string, repository: string, releaseId: string, file: File, onProgress?: (progress: number) => void) {
  const started = await api<{ upload: { id: string; partBytes: number; parts: number } }>(`/repositories/${owner}/${repository}/releases/${releaseId}/asset-uploads`, { method: 'POST', body: JSON.stringify({ name: file.name, byteSize: file.size, contentType: file.type || 'application/octet-stream' }) });
  try {
    for (let part = 1; part <= started.upload.parts; part += 1) {
      const offset = (part - 1) * started.upload.partBytes;
      const response = await fetch(`/api/v1/release-asset-uploads/${started.upload.id}/parts/${part}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file.slice(offset, Math.min(file.size, offset + started.upload.partBytes)) });
      if (!response.ok) throw await responseError(response);
      onProgress?.(part / started.upload.parts);
    }
    return (await api<{ asset: ReleaseAsset }>(`/release-asset-uploads/${started.upload.id}/complete`, { method: 'POST' })).asset;
  } catch (cause) {
    await api(`/release-asset-uploads/${started.upload.id}`, { method: 'DELETE' }).catch(() => undefined);
    throw cause;
  }
}

async function responseError(response: Response) {
  const value = await response.json().catch(() => null) as ApiError | null;
  return new MarlApiError(response.status, value?.error.code ?? 'upload_failed', value?.error.message ?? `Upload failed (${response.status}).`);
}
