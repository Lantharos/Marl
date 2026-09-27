<script lang="ts">
  import Check from 'lucide-svelte/icons/check';
  let { checked = $bindable(false), label, description, disabled = false, onchange }: { checked: boolean; label: string; description?: string; disabled?: boolean; onchange?: (checked: boolean) => void } = $props();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button type="button" class="checkbox" role="checkbox" aria-checked={checked} {disabled} onclick={toggle}><span class:checked>{#if checked}<Check size={13} strokeWidth={2.7} />{/if}</span><span><strong>{label}</strong>{#if description}<small>{description}</small>{/if}</span></button>

<style>
  .checkbox{display:flex;width:100%;align-items:flex-start;gap:10px;min-height:40px;padding:10px;border:0;border-radius:8px;background:transparent;color:var(--text);cursor:pointer;text-align:left}.checkbox>span:first-child{display:grid;width:17px;height:17px;flex:0 0 auto;margin-top:1px;border:1px solid var(--border-strong);border-radius:4px;background:var(--surface);place-items:center}.checkbox>span:first-child.checked{border-color:var(--brand);background:var(--brand);color:var(--on-brand)}.checkbox strong,.checkbox small{display:block}.checkbox strong{color:var(--text-strong);font-size:12px;font-weight:600}.checkbox small{margin-top:3px;color:var(--text-faint);font-size:11px}.checkbox:hover:not(:disabled){background:var(--surface-hover)}.checkbox:disabled{cursor:not-allowed;opacity:.5}
</style>
