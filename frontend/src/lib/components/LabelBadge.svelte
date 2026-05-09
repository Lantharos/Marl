<script lang="ts">
	let {
		name,
		color,
		className = ''
	}: {
		name: string;
		color?: string | null;
		className?: string;
	} = $props();

	const normalizedColor = $derived(normalizeColor(color));
	const textColor = $derived(readableTextColor(normalizedColor));

	function normalizeColor(value?: string | null) {
		const normalized = (value ?? '').trim().replace(/^#/, '');
		return /^[0-9a-fA-F]{6}$/.test(normalized) ? `#${normalized}` : '#2a2a28';
	}

	function readableTextColor(hex: string) {
		const value = hex.replace(/^#/, '');
		const r = parseInt(value.slice(0, 2), 16);
		const g = parseInt(value.slice(2, 4), 16);
		const b = parseInt(value.slice(4, 6), 16);
		const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		return luminance > 0.55 ? '#0f0f0d' : '#f0eee4';
	}
</script>

<span class={`inline-flex max-w-full items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${className}`} style:background-color={normalizedColor} style:color={textColor}>
	<span class="truncate">{name}</span>
</span>
