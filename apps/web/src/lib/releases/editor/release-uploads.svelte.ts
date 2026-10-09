import type { ReleaseAsset } from '@marl/contracts';
import { api, MarlApiError } from '#lib/api.js';
import { uploadReleaseAsset } from './release-upload';

export type ReleaseFile = {
  key: string;
  name: string;
  size: number;
  status: 'attached' | 'queued' | 'uploading' | 'failed';
  progress: number;
  asset?: ReleaseAsset;
  file?: File;
  error?: string;
};

export class ReleaseUploads {
  items = $state<ReleaseFile[]>([]);
  removing = $state<string | null>(null);
  error = $state('');

  constructor(
    private readonly owner: string,
    private readonly repository: string,
    assets: ReleaseAsset[]
  ) {
    this.items = assets.map((asset) => ({
      key: asset.id,
      name: asset.name,
      size: asset.byteSize,
      status: 'attached',
      progress: 1,
      asset
    }));
  }

  get uploading() {
    return this.items.some((item) => item.status === 'uploading');
  }

  get pending() {
    return this.items.filter((item) => item.status === 'queued' || item.status === 'failed');
  }

  add(files: File[]) {
    const names = new Set(this.items.map((item) => item.name));
    for (const file of files) {
      if (!file.size || names.has(file.name)) continue;
      names.add(file.name);
      this.items.push({
        key: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        status: 'queued',
        progress: 0,
        file
      });
    }
  }

  async uploadPending(releaseId: string) {
    for (const item of this.pending) await this.#upload(releaseId, item);
    return this.pending.length === 0;
  }

  async #upload(releaseId: string, item: ReleaseFile) {
    const entry = this.items.find((candidate) => candidate.key === item.key);
    if (!entry?.file) return;
    entry.status = 'uploading';
    entry.progress = 0;
    entry.error = undefined;
    try {
      entry.asset = await uploadReleaseAsset(
        this.owner,
        this.repository,
        releaseId,
        entry.file,
        (progress) => (entry.progress = progress)
      );
      entry.status = 'attached';
      entry.file = undefined;
    } catch (cause) {
      entry.status = 'failed';
      entry.error = cause instanceof MarlApiError ? cause.message : 'Upload failed.';
    }
  }

  async remove(item: ReleaseFile) {
    if (!item.asset) {
      this.items = this.items.filter((candidate) => candidate.key !== item.key);
      return;
    }
    this.removing = item.key;
    this.error = '';
    try {
      await api(`/release-assets/${item.asset.id}`, { method: 'DELETE' });
      this.items = this.items.filter((candidate) => candidate.key !== item.key);
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : `${item.name} could not be removed.`;
    } finally {
      this.removing = null;
    }
  }
}
