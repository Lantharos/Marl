<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  let { title, value, action = 'Change', disabled = false, onclick } = $props<{
    title: string; value: string; action?: string; disabled?: boolean; onclick: () => void;
  }>();
</script>

<div class="setting-row">
  <div><h3>{title}</h3><p>{value}</p></div>
  <Button size="small" {disabled} aria-label={`${action} ${title.toLowerCase()}`} aria-haspopup="dialog" {onclick}>{action}</Button>
</div>

<style>
  .setting-row{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:82px;padding:18px 0}.setting-row>div{min-width:0}h3{margin:0;color:var(--text-strong);font-size:14px;font-weight:620}p{margin:5px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.setting-row :global(.button){flex:none;min-width:76px}@media(max-width:520px){.setting-row{gap:16px;min-height:78px}p{font-size:12px}}
</style>
