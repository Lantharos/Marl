import { mount, unmount } from 'svelte';
import VideoPlayer from './VideoPlayer.svelte';

export function enhanceMedia(root: HTMLDivElement, onImage: (image: { src: string; alt: string }) => void, documentImages = false) {
  const cleanup: (() => void)[] = [];
  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    image.loading = 'lazy';
    image.decoding = 'async';
    if (image.closest('a')) continue;
    if (documentImages) {
      const open = () => onImage({ src: image.currentSrc || image.src, alt: image.alt });
      const keydown = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `View image${image.alt ? `: ${image.alt}` : ''}`);
      image.addEventListener('click', open);
      image.addEventListener('keydown', keydown);
      cleanup.push(() => { image.removeEventListener('click', open); image.removeEventListener('keydown', keydown); });
      continue;
    }
    const media = image.closest('picture') ?? image;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-image';
    button.setAttribute('aria-label', `View image${image.alt ? `: ${image.alt}` : ''}`);
    button.addEventListener('click', () => onImage({ src: image.currentSrc || image.src, alt: image.alt }));
    if (image.dataset.colorMode) button.dataset.colorMode = image.dataset.colorMode;
    media.replaceWith(button);
    button.append(media);
  }
  for (const video of root.querySelectorAll<HTMLVideoElement>('video')) {
    const src = video.getAttribute('src');
    if (!src) continue;
    const target = document.createElement('div');
    target.className = 'media-video';
    video.replaceWith(target);
    const player = mount(VideoPlayer, { target, props: { src, title: video.title || 'Attached video' } });
    cleanup.push(() => { void unmount(player); });
  }
  return () => { for (const dispose of cleanup) dispose(); };
}
