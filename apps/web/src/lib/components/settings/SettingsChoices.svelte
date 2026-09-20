<script lang="ts" generics="T extends string">
  import Check from 'lucide-svelte/icons/check';
  let { value = $bindable(), options, label, disabled = false } = $props<{
    value: T; options: Array<{ value: T; label: string; description: string }>; label: string; disabled?: boolean;
  }>();

  function navigate(event: KeyboardEvent, index: number) {
    if (disabled) return;
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % options.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    value = options[next].value;
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }
</script>

<div class="choices" role="radiogroup" aria-label={label}>
  {#each options as option, index (option.value)}
    <button type="button" role="radio" aria-checked={value === option.value} tabindex={value === option.value ? 0 : -1} {disabled} onclick={() => (value = option.value)} onkeydown={(event) => navigate(event, index)}>
      <span><strong>{option.label}</strong><small>{option.description}</small></span>
      <span class="choice-mark" aria-hidden="true">{#if value === option.value}<Check size={13} strokeWidth={2.5} />{/if}</span>
    </button>
  {/each}
</div>

<style>
  .choices{display:grid;gap:4px;padding:5px;border-radius:13px;background:var(--surface)}button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:24px;padding:16px;border:0;border-radius:9px;background:transparent;color:var(--text);font:inherit;cursor:pointer;text-align:left}button:hover:not(:disabled){background:var(--surface-hover)}button[aria-checked=true]{background:var(--surface-muted)}button:focus-visible{outline:2px solid var(--brand);outline-offset:1px}strong,small{display:block}strong{color:var(--text-strong);font-size:14px;font-weight:630}small{max-width:48ch;margin-top:5px;color:var(--text-muted);font-size:12px;line-height:1.55}.choice-mark{display:grid;width:19px;height:19px;flex:none;place-items:center;border:1px solid var(--border-strong);border-radius:50%;color:var(--on-brand)}button[aria-checked=true] .choice-mark{border-color:var(--brand);background:var(--brand)}button:disabled{cursor:wait;opacity:.65}@media(max-width:520px){button{padding:13px;gap:16px}}
</style>
