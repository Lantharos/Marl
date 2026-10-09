<script lang="ts">
  let { value, label }: { value: string; label: string } = $props();
  let code = $state<{ size: number; path: string }>();

  $effect(() => {
    const text = value;
    void import('qrcode').then(({ default: QRCode }) => {
      const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
      let path = '';
      for (let row = 0; row < modules.size; row++)
        for (let column = 0; column < modules.size; column++)
          if (modules.get(row, column)) path += `M${column} ${row}h1v1h-1z`;
      code = { size: modules.size, path };
    });
  });
</script>

<div class="mx-auto size-50 rounded-lg bg-surface-raised p-3.5 text-ink-strong [color-scheme:light]">
  {#if code}<svg
      class="size-full"
      viewBox="0 0 {code.size} {code.size}"
      shape-rendering="crispEdges"
      role="img"
      aria-label={label}><path d={code.path} fill="currentColor" /></svg
    >{/if}
</div>
