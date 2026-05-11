<script lang="ts">
	import { normalizeHexColor } from '$lib/projectAppearance';
	import Check from 'lucide-svelte/icons/check';

	type Hsv = {
		h: number;
		s: number;
		v: number;
	};

	let {
		value,
		fallback = '#d9a66c',
		label = 'Color',
		disabled = false,
		onChange
	}: {
		value: string;
		fallback?: string;
		label?: string;
		disabled?: boolean;
		onChange: (value: string) => void;
	} = $props();

	const quickColors = [
		'#d9a66c',
		'#eae9e4',
		'#8fbf73',
		'#79bde8',
		'#b394ff',
		'#d96c5a',
		'#0f0f0d',
		'#2a2a28'
	];

	let open = $state(false);
	let activeDrag = $state<'sv' | 'hue' | null>(null);
	let root: HTMLDivElement | undefined = $state();
	let svControl: HTMLButtonElement | undefined = $state();
	let hueControl: HTMLButtonElement | undefined = $state();

	const currentHex = $derived(normalizeHexColor(value, fallback));
	const hsv = $derived(hexToHsv(currentHex));
	const hueColor = $derived(hsvToHex({ h: hsv.h, s: 1, v: 1 }));
	const svBackground = $derived(
		`linear-gradient(to top, #000 0%, rgba(0,0,0,0) 100%), linear-gradient(to right, #fff 0%, rgba(255,255,255,0) 100%), hsl(${hsv.h} 100% 50%)`
	);
	const hueBackground =
		'linear-gradient(to right, #f00 0%, #ff0 16.66%, #0f0 33.33%, #0ff 50%, #00f 66.66%, #f0f 83.33%, #f00 100%)';

	function toggleOpen() {
		if (disabled) return;
		open = !open;
	}

	function close() {
		activeDrag = null;
		open = false;
	}

	function handleWindowPointerDown(event: PointerEvent) {
		if (!open || activeDrag || root?.contains(event.target as Node)) return;
		close();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		event.preventDefault();
		close();
	}

	function handleWindowPointerMove(event: PointerEvent) {
		if (!activeDrag) return;
		event.preventDefault();
		updateFromPointer(activeDrag, event);
	}

	function stopDrag() {
		activeDrag = null;
	}

	function startDrag(mode: 'sv' | 'hue', event: PointerEvent) {
		activeDrag = mode;
		updateFromPointer(mode, event);
		event.preventDefault();
	}

	function updateFromPointer(mode: 'sv' | 'hue', event: PointerEvent) {
		const element = mode === 'sv' ? svControl : hueControl;
		const rect = element?.getBoundingClientRect();
		if (!rect) return;
		if (mode === 'hue') {
			const h = clamp((event.clientX - rect.left) / rect.width) * 360;
			onChange(hsvToHex({ ...hsv, h }));
			return;
		}
		const s = clamp((event.clientX - rect.left) / rect.width);
		const v = 1 - clamp((event.clientY - rect.top) / rect.height);
		onChange(hsvToHex({ ...hsv, s, v }));
	}

	function adjustSaturationValue(event: KeyboardEvent) {
		const step = event.shiftKey ? 0.1 : 0.02;
		let { s, v } = hsv;
		if (event.key === 'ArrowLeft') s = clamp(s - step);
		else if (event.key === 'ArrowRight') s = clamp(s + step);
		else if (event.key === 'ArrowDown') v = clamp(v - step);
		else if (event.key === 'ArrowUp') v = clamp(v + step);
		else return;
		event.preventDefault();
		onChange(hsvToHex({ ...hsv, s, v }));
	}

	function adjustHue(event: KeyboardEvent) {
		const step = event.shiftKey ? 15 : 2;
		let { h } = hsv;
		if (event.key === 'ArrowLeft') h -= step;
		else if (event.key === 'ArrowRight') h += step;
		else return;
		event.preventDefault();
		onChange(hsvToHex({ ...hsv, h: wrapHue(h) }));
	}

	function clamp(value: number, min = 0, max = 1) {
		return Math.min(max, Math.max(min, value));
	}

	function wrapHue(value: number) {
		return ((value % 360) + 360) % 360;
	}

	function hexToHsv(hex: string): Hsv {
		const rgb = hexToRgb(hex);
		const r = rgb.r / 255;
		const g = rgb.g / 255;
		const b = rgb.b / 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const delta = max - min;
		let h = 0;
		if (delta !== 0) {
			if (max === r) h = 60 * (((g - b) / delta) % 6);
			else if (max === g) h = 60 * ((b - r) / delta + 2);
			else h = 60 * ((r - g) / delta + 4);
		}
		return {
			h: wrapHue(h),
			s: max === 0 ? 0 : delta / max,
			v: max
		};
	}

	function hsvToHex(color: Hsv) {
		const h = wrapHue(color.h);
		const s = clamp(color.s);
		const v = clamp(color.v);
		const c = v * s;
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
		const m = v - c;
		let [r, g, b] = [0, 0, 0];
		if (h < 60) [r, g, b] = [c, x, 0];
		else if (h < 120) [r, g, b] = [x, c, 0];
		else if (h < 180) [r, g, b] = [0, c, x];
		else if (h < 240) [r, g, b] = [0, x, c];
		else if (h < 300) [r, g, b] = [x, 0, c];
		else [r, g, b] = [c, 0, x];
		return rgbToHex({
			r: Math.round((r + m) * 255),
			g: Math.round((g + m) * 255),
			b: Math.round((b + m) * 255)
		});
	}

	function hexToRgb(hex: string) {
		const value = normalizeHexColor(hex, fallback).slice(1);
		return {
			r: Number.parseInt(value.slice(0, 2), 16),
			g: Number.parseInt(value.slice(2, 4), 16),
			b: Number.parseInt(value.slice(4, 6), 16)
		};
	}

	function rgbToHex(rgb: { r: number; g: number; b: number }) {
		return `#${[rgb.r, rgb.g, rgb.b]
			.map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, '0'))
			.join('')}`;
	}
</script>

<svelte:window
	onkeydown={handleWindowKeydown}
	onpointerdown={handleWindowPointerDown}
	onpointermove={handleWindowPointerMove}
	onpointerup={stopDrag}
/>

<div class="relative" bind:this={root}>
	<button
		type="button"
		class="flex h-9 w-9 shrink-0 items-center justify-center border-r border-[#2a2a28] bg-[#141412] disabled:opacity-50"
		aria-label={`Open ${label} color picker`}
		aria-expanded={open}
		disabled={disabled}
		onclick={toggleOpen}
	>
		<span class="h-4 w-4 border border-[#2a2a28]" style={`background: ${currentHex}`}></span>
	</button>

	{#if open}
		<div class="absolute left-0 top-full z-50 mt-1 w-64 border border-[#2a2a28] bg-[#141412] p-3 shadow-2xl shadow-black/35">
			<div class="mb-2 flex items-center justify-between gap-3">
				<div class="min-w-0 text-xs font-medium text-[#eae9e4]">{label}</div>
				<div class="font-mono text-[11px] text-[#8c887e]">{currentHex}</div>
			</div>

			<button
				type="button"
				class="relative h-36 w-full cursor-crosshair touch-none overflow-hidden border border-[#2a2a28] focus-visible:outline-none"
				aria-label={`${label} saturation and brightness`}
				style={`background: ${svBackground}`}
				bind:this={svControl}
				onpointerdown={(event) => startDrag('sv', event)}
				onkeydown={adjustSaturationValue}
			>
				<span
					class="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
					style={`left: ${hsv.s * 100}%; top: ${(1 - hsv.v) * 100}%`}
				></span>
			</button>

			<button
				type="button"
				class="relative mt-3 h-5 w-full touch-none border border-[#2a2a28] focus-visible:outline-none"
				aria-label={`${label} hue`}
				style={`background: ${hueBackground}`}
				bind:this={hueControl}
				onpointerdown={(event) => startDrag('hue', event)}
				onkeydown={adjustHue}
			>
				<span
					class="absolute top-1/2 h-7 w-2 -translate-x-1/2 -translate-y-1/2 border border-white bg-[#0f0f0d] shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
					style={`left: ${(hsv.h / 360) * 100}%`}
				></span>
			</button>

			<div class="mt-3 grid grid-cols-8 gap-1">
				{#each quickColors as color (color)}
					<button
						type="button"
						class="flex h-6 items-center justify-center border border-[#2a2a28] hover:border-[#d9a66c]"
						aria-label={`Use ${color}`}
						style={`background: ${color}`}
						onclick={() => onChange(color)}
					>
						{#if normalizeHexColor(color, fallback) === currentHex}
							<Check class="h-3.5 w-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
						{/if}
					</button>
				{/each}
			</div>

			<div class="mt-3 flex justify-end">
				<button
					type="button"
					class="h-8 border border-[#2a2a28] px-3 text-xs text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
					onclick={close}
				>
					Done
				</button>
			</div>
		</div>
	{/if}
</div>
