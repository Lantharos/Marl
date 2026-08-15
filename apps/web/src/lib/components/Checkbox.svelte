<script lang="ts">
  import Check from 'lucide-svelte/icons/check';
  let { checked = $bindable(false), label, description }: { checked: boolean; label: string; description?: string } = $props();
</script>

<button type="button" class="checkbox" role="checkbox" aria-checked={checked} onclick={() => (checked = !checked)}><span class:checked>{#if checked}<Check size={13} strokeWidth={2.7} />{/if}</span><span><strong>{label}</strong>{#if description}<small>{description}</small>{/if}</span></button>

<style>
  .checkbox{display:flex;width:100%;align-items:flex-start;gap:9px;padding:10px;border:0;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);background:transparent;color:var(--text);cursor:pointer;text-align:left}.checkbox>span:first-child{display:grid;width:17px;height:17px;flex:0 0 auto;margin-top:1px;border:1px solid var(--border-strong);border-radius:4px;background:var(--surface);place-items:center}.checkbox>span:first-child.checked{border-color:var(--brand);background:var(--brand);color:#fff}.checkbox strong,.checkbox small{display:block}.checkbox strong{color:var(--text-strong);font-size:10px}.checkbox small{margin-top:3px;color:var(--text-faint);font-size:9px}
</style>
