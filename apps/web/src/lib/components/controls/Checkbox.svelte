<script lang="ts">
  import Check from '@lucide/svelte/icons/check';

  let {
    checked = $bindable(false),
    label,
    description,
    disabled = false,
    onchange
  }: {
    checked: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  } = $props();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="checkbox"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={toggle}
  class="flex min-h-10 w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:not-disabled:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
>
  <span
    class={[
      'mt-px grid size-4.5 shrink-0 place-items-center rounded-[5px] border transition-colors',
      checked ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface'
    ]}
  >
    {#if checked}<Check size={13} strokeWidth={2.8} />{/if}
  </span>
  <span class="min-w-0">
    <span class="block text-sm font-semibold text-ink-strong">{label}</span>
    {#if description}<span class="mt-0.5 block text-xs text-ink-muted">{description}</span>{/if}
  </span>
</button>
