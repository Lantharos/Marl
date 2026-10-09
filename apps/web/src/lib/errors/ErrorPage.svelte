<script lang="ts">
  import type { Snippet } from 'svelte';
  import WifiOff from '@lucide/svelte/icons/wifi-off';
  import Scene from '#lib/components/page/Scene.svelte';

  let {
    status,
    title,
    detail,
    scene,
    children
  }: { status?: number; title: string; detail?: string; scene: string; children: Snippet } = $props();
  const offline = $derived(!status);
</script>

<main
  class="grid h-dvh min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,auto)] overflow-clip bg-canvas"
  aria-labelledby="error-title"
>
  <div class="grid min-h-0 place-items-center px-5 py-[clamp(16px,4vh,48px)] [@media(max-height:520px)]:py-3.5">
    <div
      class={[
        'flex w-fit max-w-full flex-col items-center gap-5 text-center',
        !offline && 'sm:flex-row sm:gap-10 sm:text-left'
      ]}
    >
      {#if status}
        <p
          class="shrink-0 text-[clamp(92px,11vw,148px)] leading-none font-semibold tracking-[-0.075em] text-brand tabular-nums [@media(max-height:520px)]:text-[80px]"
        >
          {status}
        </p>
      {:else}
        <div class="grid place-items-center text-brand" aria-hidden="true">
          <WifiOff class="size-24 sm:size-32 [@media(max-height:520px)]:size-15" strokeWidth={1.25} />
        </div>
      {/if}
      <div class="max-w-78 min-w-0 sm:max-w-none">
        <h1
          id="error-title"
          class={[
            'mx-auto w-max max-w-full text-[clamp(24px,2.6vw,34px)] leading-tight font-semibold tracking-[-0.04em] whitespace-pre-line text-ink-strong',
            !offline && 'sm:mx-0'
          ]}
        >
          {title}
        </h1>
        {#if detail}<p class="mt-3 max-w-[46ch] text-sm leading-relaxed text-ink-muted">{detail}</p>{/if}
        <div class={['mt-5 flex flex-wrap items-center justify-center gap-2', !offline && 'sm:justify-start']}>
          {@render children()}
        </div>
      </div>
    </div>
  </div>
  <Scene
    {scene}
    class={[
      'h-[min(260px,38dvh)]',
      offline
        ? 'sm:h-[min(36vw,calc(100dvh-340px),510px)] [@media(max-height:520px)]:h-[max(0px,calc(100dvh-245px))]'
        : 'sm:h-[min(36vw,54dvh,510px)]'
    ]}
  />
</main>
