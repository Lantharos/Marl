<script lang="ts">
  import type { ClassValue } from 'svelte/elements';

  let { scene, class: className }: { scene: string; class?: ClassValue } = $props();
</script>

<div
  class={[
    'w-full bg-canvas bg-(image:--art-small-dark) [background-size:auto_100%] bg-bottom bg-no-repeat bg-blend-lighten light:bg-(image:--art-small-light) light:bg-blend-darken',
    'sm:bg-(image:--art-dark) sm:bg-cover sm:light:bg-(image:--art-light)',
    className
  ]}
  aria-hidden="true"
  style:--art-dark={`url('/errors/${scene}/dark.webp')`}
  style:--art-light={`url('/errors/${scene}/light.webp')`}
  style:--art-small-dark={`url('/errors/${scene}/dark-small.webp')`}
  style:--art-small-light={`url('/errors/${scene}/light-small.webp')`}
></div>
