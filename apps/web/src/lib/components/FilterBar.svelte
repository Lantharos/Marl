<script lang="ts">
  import Search from 'lucide-svelte/icons/search';
  let {
    placeholder,
    tabs = ['Open', 'Closed'],
    active = $bindable('Open'),
    query = $bindable('')
  }: { placeholder: string; tabs?: string[]; active?: string; query?: string } = $props();
</script>
<div class="filter-bar"><div class="tabs" aria-label="Filter">{#each tabs as tab}<button type="button" class:active={tab === active} onclick={() => (active = tab)}>{tab}</button>{/each}</div><label><Search size={14} /><input bind:value={query} aria-label={placeholder} {placeholder} /></label></div>
<style>
  .filter-bar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:10px;border-bottom:1px solid var(--border)}.tabs{display:flex;align-self:stretch;gap:17px}.tabs button{position:relative;height:38px;padding:0;border:0;background:transparent;color:var(--text-faint);cursor:pointer;font-size:10px;font-weight:600}.tabs button:hover,.tabs button.active{color:var(--text-strong)}.tabs button.active::after{position:absolute;inset:auto 0 -1px;height:2px;background:var(--brand);content:''}label{display:flex;width:min(270px,45%);align-items:center;gap:7px;height:29px;margin-bottom:7px;padding:0 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text-faint)}input{width:100%;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:10px}input::placeholder{color:var(--text-faint)}@media(max-width:600px){.filter-bar{align-items:flex-end;gap:10px}label{width:42%;min-width:130px}.tabs{gap:12px}}
</style>
