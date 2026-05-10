<script lang="ts">
	let {
		checked,
		disabled = false,
		label,
		onToggle
	}: {
		checked: boolean;
		disabled?: boolean;
		label: string;
		onToggle: () => void | Promise<void>;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-label={label}
	aria-checked={checked}
	class="relative h-6 w-11 shrink-0 border border-[#2a2a28] bg-[#0f0f0d] transition-colors disabled:opacity-50 {checked ? 'border-[#d9a66c] bg-[#2f2a1c]' : 'hover:border-[#3a3a36]'}"
	{disabled}
	onclick={onToggle}
>
	<span class="absolute top-1 h-3.5 w-3.5 bg-[#8c887e] transition-[left,background-color] {checked ? 'left-6 bg-[#d9a66c]' : 'left-1'}"></span>
</button>
