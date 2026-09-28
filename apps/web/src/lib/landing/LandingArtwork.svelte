<script lang="ts">
  let { scene, class: className = '' }: { scene: 'landscape' | 'courtyard' | 'inlay'; class?: string } = $props();
  const url = (theme: 'dark' | 'light', small: boolean) =>
    `url('/landing/${scene}/${theme}${small ? '-small' : ''}.webp')`;
  const responsive = (theme: 'dark' | 'light') => `image-set(${url(theme, true)} 1x, ${url(theme, false)} 2x)`;
</script>

<div
  aria-hidden="true"
  class={[
    'pointer-events-none bg-canvas bg-no-repeat bg-blend-lighten select-none light:bg-blend-multiply',
    'bg-(image:--art-dark) lg:bg-(image:--art-dark-large) light:bg-(image:--art-light) lg:light:bg-(image:--art-light-large)',
    className
  ]}
  style:--art-dark={responsive('dark')}
  style:--art-light={responsive('light')}
  style:--art-dark-large={url('dark', false)}
  style:--art-light-large={url('light', false)}
></div>
