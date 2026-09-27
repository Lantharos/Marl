<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import VolumeX from '@lucide/svelte/icons/volume-x';
  import Maximize from '@lucide/svelte/icons/maximize';
  import Button from '$lib/components/controls/Button.svelte';

  let { src, title = 'Attached video' }: { src: string; title?: string } = $props();
  let video: HTMLVideoElement;
  let frame: HTMLDivElement;
  let paused = $state(true);
  let muted = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let loaded = $state(false);
  let loading = $state(false);
  let failure = $state('');
  let ratio = $state(16 / 9);
  let dragging = false;
  let playbackRequested = false;
  const length = $derived(Number.isFinite(duration) ? duration : 0);
  const progress = $derived(length ? Math.min(100, (currentTime / length) * 100) : 0);

  function loadPreview(element: HTMLVideoElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (playbackRequested) return;
        element.preload = 'metadata';
        element.load();
      },
      { rootMargin: '240px' }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.pause();
    };
  }

  function metadataLoaded() {
    ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    if (video.paused && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime === 0) {
      video.currentTime = Number.isFinite(video.duration) ? Math.min(0.001, video.duration / 2) : 0.001;
    }
  }

  function time(seconds: number) {
    if (!Number.isFinite(seconds)) return '0:00';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  async function toggle() {
    failure = '';
    if (!video.paused) {
      video.pause();
      return;
    }
    playbackRequested = true;
    loading = true;
    try {
      await video.play();
    } catch {
      failure = 'This video could not be played. You can open the original instead.';
    }
    loading = false;
  }

  function seek(event: PointerEvent) {
    if (!length) return;
    const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
    if (bounds) currentTime = Math.max(0, Math.min(length, ((event.clientX - bounds.left) / bounds.width) * length));
  }

  function seekKey(event: KeyboardEvent) {
    if (!length || !['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') currentTime = 0;
    else if (event.key === 'End') currentTime = length;
    else
      currentTime = Math.max(
        0,
        Math.min(length, currentTime + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 5))
      );
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch {
      failure = 'Fullscreen is unavailable in this browser.';
    }
  }
</script>

<div
  class="group/video w-[min(100%,var(--media-max-width,800px))] overflow-hidden rounded-lg bg-surface-muted text-ink shadow-surface [&:fullscreen]:grid [&:fullscreen]:size-full [&:fullscreen]:grid-rows-[minmax(0,1fr)_auto] [&:fullscreen]:rounded-none [&:fullscreen]:bg-canvas"
  bind:this={frame}
>
  <div
    class="relative grid max-h-[min(70vh,var(--media-max-height,70vh))] w-full place-items-center bg-surface-muted group-[:fullscreen]/video:size-full group-[:fullscreen]/video:max-h-full"
    style:aspect-ratio={ratio}
  >
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={video}
      {@attach loadPreview}
      {src}
      preload="none"
      playsinline
      aria-label={title}
      class="block size-full max-h-[min(70vh,var(--media-max-height,70vh))] object-contain group-[:fullscreen]/video:max-h-full"
      bind:paused
      bind:muted
      bind:currentTime
      bind:duration
      onloadedmetadata={metadataLoaded}
      onloadeddata={() => (loaded = true)}
      onwaiting={() => (loading = true)}
      oncanplay={() => (loading = false)}
      onplaying={() => (loading = false)}
      onerror={() => {
        loading = false;
        failure = 'This video could not be loaded. Try opening the original.';
      }}
    ></video>
    {#if !loaded}<span class="absolute inset-x-4.5 bottom-4 truncate text-center text-xs text-ink-muted">{title}</span
      >{/if}
    {#if paused && !failure}<Button
        class="absolute size-16! rounded-full bg-surface-raised text-ink-strong"
        icon
        variant="secondary"
        aria-label={`Play ${title}`}
        {loading}
        onclick={toggle}
        >{#if !loading}<Play size={25} fill="currentColor" />{/if}</Button
      >{/if}
  </div>
  <div class="flex items-center gap-0.5 bg-surface p-1 sm:gap-2 sm:px-2.5 sm:py-2">
    <Button icon size="small" variant="ghost" aria-label={paused ? 'Play video' : 'Pause video'} onclick={toggle}
      >{#if paused}<Play size={16} />{:else}<Pause size={16} />{/if}</Button
    >
    <span class="flex items-center gap-1 text-xs whitespace-nowrap text-ink-strong tabular-nums"
      ><span>{time(currentTime)}</span>{#if length}<span class="text-ink-faint max-[440px]:hidden">/</span><span
          class="text-ink-faint max-[440px]:hidden">{time(length)}</span
        >{/if}</span
    >
    <div
      class="flex h-8 min-w-6 flex-1 cursor-pointer touch-none items-center rounded px-1 focus-visible:outline-2 focus-visible:outline-brand aria-disabled:cursor-default aria-disabled:opacity-50 pointer-coarse:h-10"
      role="slider"
      tabindex={length ? 0 : -1}
      aria-label="Video position"
      aria-valuemin={0}
      aria-valuemax={length || 100}
      aria-valuenow={currentTime}
      aria-valuetext={`${time(currentTime)} of ${time(length)}`}
      aria-disabled={!length}
      onkeydown={seekKey}
      onpointerdown={(event) => {
        if (!length) return;
        dragging = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        seek(event);
      }}
      onpointermove={(event) => {
        if (dragging) seek(event);
      }}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
    >
      <span class="block h-1 w-full overflow-hidden rounded-full bg-line-strong"
        ><span class="block h-full rounded-full bg-brand" style:width={`${progress}%`}></span></span
      >
    </div>
    <Button
      icon
      size="small"
      variant="ghost"
      aria-label={muted ? 'Unmute video' : 'Mute video'}
      onclick={() => (muted = !muted)}
      >{#if muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}</Button
    >
    <Button icon size="small" variant="ghost" aria-label="Toggle fullscreen" onclick={fullscreen}
      ><Maximize size={16} /></Button
    >
  </div>
  {#if failure}<p class="px-3.5 py-2.5 text-xs leading-normal text-ink-muted" role="alert">
      {failure}
      <a class="text-brand hover:underline" href={src} target="_blank" rel="noopener noreferrer">Open video</a>
    </p>{/if}
</div>
