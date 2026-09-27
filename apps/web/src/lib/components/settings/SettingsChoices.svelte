<script lang="ts" generics="T extends string">
  import Check from '@lucide/svelte/icons/check';

  let {
    value = $bindable(),
    options,
    label,
    disabled = false
  }: {
    value: T;
    options: Array<{ value: T; label: string; description: string }>;
    label: string;
    disabled?: boolean;
  } = $props();

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

<div class="grid gap-1 rounded-xl bg-surface p-1" role="radiogroup" aria-label={label}>
  {#each options as option, index (option.value)}
    {@const selected = value === option.value}
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabindex={selected ? 0 : -1}
      {disabled}
      onclick={() => (value = option.value)}
      onkeydown={(event) => navigate(event, index)}
      class={[
        'flex w-full items-center justify-between gap-4 rounded-lg p-3.5 text-left transition-colors disabled:cursor-wait disabled:opacity-65 sm:gap-6 sm:p-4',
        selected ? 'bg-surface-muted' : 'hover:not-disabled:bg-surface-hover'
      ]}
    >
      <span class="min-w-0">
        <span class="block text-base font-semibold text-ink-strong">{option.label}</span>
        <span class="mt-1 block max-w-[48ch] text-sm leading-relaxed text-ink-muted">{option.description}</span>
      </span>
      <span
        class={[
          'grid size-5 shrink-0 place-items-center rounded-full border text-on-brand',
          selected ? 'border-brand bg-brand' : 'border-line-strong'
        ]}
        aria-hidden="true"
        >{#if selected}<Check size={13} strokeWidth={2.6} />{/if}</span
      >
    </button>
  {/each}
</div>
