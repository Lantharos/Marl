<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<span class:compact class="brand" aria-label="Sty">
  <span class="word">sty</span><span class="cursor" aria-hidden="true"></span>
</span>

<style>
  .brand{display:inline-flex;align-items:flex-end;gap:4px;color:var(--text-strong);font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:18px;font-weight:760;letter-spacing:-.08em;line-height:1}.cursor{width:5px;height:5px;margin-bottom:1px;border-radius:1px;background:var(--brand)}.compact{font-size:16px}
</style>
