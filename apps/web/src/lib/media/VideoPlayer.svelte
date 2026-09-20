<script lang="ts">
  import Play from 'lucide-svelte/icons/play';
  import Pause from 'lucide-svelte/icons/pause';
  import Volume2 from 'lucide-svelte/icons/volume-2';
  import VolumeX from 'lucide-svelte/icons/volume-x';
  import Maximize from 'lucide-svelte/icons/maximize';
  import Button from '$lib/components/Button.svelte';

  let { src, title = 'Attached video' } = $props<{ src: string; title?: string }>();
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
  const progress = $derived(length ? Math.min(100, currentTime / length * 100) : 0);

  function loadPreview(element: HTMLVideoElement) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      if (playbackRequested) return;
      element.preload = 'metadata';
      element.load();
    }, { rootMargin: '240px' });
    observer.observe(element);
    return () => { observer.disconnect(); element.pause(); };
  }

  function metadataLoaded() {
    ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    if (video.paused && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime === 0) {
      video.currentTime = Number.isFinite(video.duration) ? Math.min(.001, video.duration / 2) : .001;
    }
  }

  function time(seconds: number) {
    if (!Number.isFinite(seconds)) return '0:00';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  async function toggle() {
    failure = '';
    if (!video.paused) { video.pause(); return; }
    playbackRequested = true;
    loading = true;
    try { await video.play(); } catch { failure = 'This video could not be played. You can open the original instead.'; }
    loading = false;
  }

  function seek(event: PointerEvent) {
    if (!length) return;
    const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
    if (bounds) currentTime = Math.max(0, Math.min(length, (event.clientX - bounds.left) / bounds.width * length));
  }

  function seekKey(event: KeyboardEvent) {
    if (!length || !['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') currentTime = 0;
    else if (event.key === 'End') currentTime = length;
    else currentTime = Math.max(0, Math.min(length, currentTime + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 5)));
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch { failure = 'Fullscreen is unavailable in this browser.'; }
  }
</script>

<div class="video-player" bind:this={frame}>
  <div class="picture" style:aspect-ratio={ratio}>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} {@attach loadPreview} {src} preload="none" playsinline aria-label={title} bind:paused bind:muted bind:currentTime bind:duration onloadedmetadata={metadataLoaded} onloadeddata={() => (loaded = true)} onwaiting={() => (loading = true)} oncanplay={() => (loading = false)} onplaying={() => (loading = false)} onerror={() => { loading = false; failure = 'This video could not be loaded. Try opening the original.'; }}></video>
    {#if !loaded}<span class="video-title">{title}</span>{/if}
    {#if paused && !failure}<Button class="play-overlay" icon variant="secondary" aria-label={`Play ${title}`} loading={loading} onclick={toggle}>{#if !loading}<Play size={25} fill="currentColor" />{/if}</Button>{/if}
  </div>
  <div class="controls">
    <Button icon size="small" variant="ghost" aria-label={paused ? 'Play video' : 'Pause video'} onclick={toggle}>{#if paused}<Play size={16} />{:else}<Pause size={16} />{/if}</Button>
    <span class="time"><span>{time(currentTime)}</span>{#if length}<span class="time-separator">/</span><span class="duration">{time(length)}</span>{/if}</span>
    <div class="seek" role="slider" tabindex={length ? 0 : -1} aria-label="Video position" aria-valuemin={0} aria-valuemax={length || 100} aria-valuenow={currentTime} aria-valuetext={`${time(currentTime)} of ${time(length)}`} aria-disabled={!length} onkeydown={seekKey} onpointerdown={(event) => { if (!length) return; dragging = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); seek(event); }} onpointermove={(event) => { if (dragging) seek(event); }} onpointerup={() => (dragging = false)} onpointercancel={() => (dragging = false)}><span class="seek-track"><span class="seek-progress" style:width={`${progress}%`}></span></span></div>
    <Button icon size="small" variant="ghost" aria-label={muted ? 'Unmute video' : 'Mute video'} onclick={() => (muted = !muted)}>{#if muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}</Button>
    <Button icon size="small" variant="ghost" aria-label="Toggle fullscreen" onclick={fullscreen}><Maximize size={16} /></Button>
  </div>
  {#if failure}<p class="video-error" role="alert">{failure} <a href={src} target="_blank" rel="noopener noreferrer">Open video</a></p>{/if}
</div>

<style>
  .video-player{width:min(100%,var(--media-max-width,800px));overflow:hidden;border-radius:10px;background:var(--surface-muted);color:var(--text);box-shadow:var(--shadow-surface);font-family:inherit}
  .picture{position:relative;display:grid;width:100%;max-height:min(70vh,var(--media-max-height,70vh));place-items:center;background:var(--surface-muted)}
  video{display:block;width:100%;height:100%;max-height:min(70vh,var(--media-max-height,70vh));object-fit:contain}
  .video-title{position:absolute;right:18px;bottom:16px;left:18px;overflow:hidden;color:var(--text-muted);font-size:12px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
  .picture :global(.play-overlay){position:absolute;width:64px;height:64px;border-radius:50%;background:var(--surface-raised);color:var(--text-strong);box-shadow:var(--shadow-surface)}
  .controls{display:flex;align-items:center;gap:7px;padding:7px 9px;background:var(--surface)}
  .controls :global(.button){width:32px;height:32px;flex-shrink:0}
  .time{display:flex;align-items:center;gap:4px;color:var(--text-strong);font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}
  .time-separator,.duration{color:var(--text-faint)}
  .seek{display:flex;min-width:24px;height:30px;flex:1;align-items:center;padding:0 4px;border-radius:4px;cursor:pointer;touch-action:none}
  .seek:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
  .seek[aria-disabled='true']{cursor:default;opacity:.5}
  .seek-track{display:block;width:100%;height:4px;overflow:hidden;border-radius:3px;background:var(--border-strong)}
  .seek-progress{display:block;height:100%;border-radius:inherit;background:var(--brand)}
  .video-error{margin:0;padding:10px 14px;color:var(--text-muted);font-size:12px;line-height:1.5}
  .video-error a{color:var(--brand)}
  .video-player:fullscreen{display:grid;width:100%;height:100%;grid-template-rows:minmax(0,1fr) auto;border-radius:0;background:var(--canvas)}
  .video-player:fullscreen .picture,.video-player:fullscreen video{width:100%;height:100%;min-height:0;max-height:100%}
  @media(pointer:coarse){.controls :global(.button){width:40px;height:40px}.seek{height:40px}}
  @media(max-width:440px){.controls{gap:2px;padding:4px}.time{font-size:10px}.time-separator,.duration{display:none}}
</style>
