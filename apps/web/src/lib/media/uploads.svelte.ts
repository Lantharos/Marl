import type { MarkdownContext } from '$lib/markdown';

export const mediaAccept = 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm';
const acceptedTypes = new Set(mediaAccept.split(','));

export type UploadedMedia = { id: string; url: string; name: string; contentType: string; size: number };
export type MediaUpload = {
  id: string;
  file: File;
  marker: string;
  context: MarkdownContext;
  progress: number;
  status: 'queued' | 'uploading' | 'failed';
  error: string;
};

export function mediaFileError(file: File) {
  if (!acceptedTypes.has(file.type)) return `${file.name}: use PNG, JPEG, GIF, WebP, MP4, or WebM.`;
  const limit = file.type.startsWith('video/') ? 50 : 10;
  if (!file.size) return `${file.name} is empty.`;
  if (file.size > limit * 1024 * 1024) return `${file.name} is too large. The limit is ${limit} MB.`;
  return '';
}

export function mediaMarkdown(media: UploadedMedia) {
  if (!/^\/api\/v1\/media\/media_[a-zA-Z0-9_-]+$/.test(media.url)) throw new Error('Marl returned an invalid attachment URL.');
  const name = media.name.replaceAll(/[\r\n]/g, ' ');
  if (media.contentType.startsWith('video/')) {
    const title = name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `<video src="${media.url}" title="${title}"></video>`;
  }
  return `![${name.replaceAll(/([\\\[\]])/g, '\\$1')}](${media.url})`;
}

export class MediaUploadQueue {
  entries = $state<MediaUpload[]>([]);
  private requests = new Map<string, XMLHttpRequest>();
  private disposed = false;

  constructor(private replace: (marker: string, replacement: string) => void, private busy: (value: boolean) => void) {}

  enqueue(files: File[], context: MarkdownContext) {
    const entries = files.map((file): MediaUpload => {
      const id = crypto.randomUUID();
      return { id, file, context: { ...context }, marker: `![Uploading ${file.name.replaceAll(/[\[\]\r\n]/g, '')}…](marl-upload:${id})`, progress: 0, status: 'queued', error: '' };
    });
    this.entries.push(...entries);
    this.busy(true);
    return entries.map((entry) => entry.marker).join('\n\n');
  }

  start() {
    if (this.disposed) return;
    for (const entry of this.entries) {
      if (this.requests.size >= 2) break;
      if (entry.status === 'queued') this.upload(entry);
    }
    this.busy(this.entries.length > 0);
  }

  retry(entry: MediaUpload) {
    entry.status = 'queued';
    entry.error = '';
    entry.progress = 0;
    this.start();
  }

  remove(entry: MediaUpload) {
    this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
    this.replace(entry.marker, '');
    this.requests.get(entry.id)?.abort();
    this.requests.delete(entry.id);
    this.start();
  }

  dispose() {
    this.disposed = true;
    for (const request of this.requests.values()) request.abort();
    this.requests.clear();
    for (const entry of this.entries) this.replace(entry.marker, '');
    this.entries = [];
    this.busy(false);
  }

  private upload(entry: MediaUpload) {
    const request = new XMLHttpRequest();
    this.requests.set(entry.id, request);
    entry.status = 'uploading';
    const finish = (error?: string, media?: UploadedMedia) => {
      if (this.disposed || !this.entries.some((candidate) => candidate.id === entry.id)) return;
      this.requests.delete(entry.id);
      if (error) {
        entry.status = 'failed';
        entry.error = error;
      } else if (media) {
        try {
          this.replace(entry.marker, mediaMarkdown(media));
          this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
        } catch (cause) {
          entry.status = 'failed';
          entry.error = cause instanceof Error ? cause.message : 'Could not attach this file.';
        }
      }
      this.start();
    };
    request.open('POST', `/api/v1/repositories/${encodeURIComponent(entry.context.owner)}/${encodeURIComponent(entry.context.repository)}/media?name=${encodeURIComponent(entry.file.name)}`);
    request.timeout = 180_000;
    request.setRequestHeader('Content-Type', entry.file.type);
    request.setRequestHeader('X-Media-Size', String(entry.file.size));
    request.setRequestHeader('Accept', 'application/json');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) entry.progress = Math.min(99, Math.round(event.loaded / event.total * 100));
    };
    request.onerror = () => finish('Connection lost. Try uploading again.');
    request.ontimeout = () => finish('The upload timed out. Try again.');
    request.onload = () => {
      let result: { media?: UploadedMedia; error?: { message?: string } };
      try { result = JSON.parse(request.responseText); } catch { finish('Could not upload this file. Try again.'); return; }
      if (request.status < 200 || request.status >= 300 || !result.media) {
        finish(result.error?.message ?? `The upload failed (${request.status}).`);
        return;
      }
      finish(undefined, result.media);
    };
    request.send(entry.file);
  }
}
