<script lang="ts">
  let { name, color, size = 'medium' }: { name: string; color: string; size?: 'small' | 'medium' } = $props();
</script>

<span
  class={[
    'inline-flex max-w-full items-center gap-1.5 rounded-full bg-(--label-color)/15 font-semibold text-(--label-color)',
    size === 'small' ? 'h-5.5 px-2 text-2xs' : 'h-6.5 px-2.5 text-xs'
  ]}
  style:--label-color={color}
  ><span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span><span class="truncate">{name}</span
  ></span
>
