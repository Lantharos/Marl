<script lang="ts">
	import { onDestroy } from 'svelte';
	import { isAbortError, publicFetch } from '$lib/apiShared';
	import ImageIcon from 'lucide-svelte/icons/image';
	import Loader2 from 'lucide-svelte/icons/loader-2';

	let { src, alt = '', class: className = '' }: { src: string | null | undefined; alt?: string; class?: string } = $props();

	let objectUrl = $state('');
	let loading = $state(false);
	let error = $state('');

	$effect(() => {
		if (!src) {
			revokeObjectUrl();
			loading = false;
			error = '';
			return;
		}
		const controller = new AbortController();
		void load(src, controller);
		return () => controller.abort();
	});

	onDestroy(revokeObjectUrl);

	async function load(url: string, controller: AbortController) {
		loading = true;
		error = '';
		try {
			const response = await publicFetch(url, { signal: controller.signal });
			const blob = await response.blob();
			if (controller.signal.aborted) return;
			revokeObjectUrl();
			objectUrl = URL.createObjectURL(blob);
		} catch (value) {
			if (isAbortError(value)) return;
			error = 'Image unavailable';
			revokeObjectUrl();
		} finally {
			if (!controller.signal.aborted) loading = false;
		}
	}

	function revokeObjectUrl() {
		if (!objectUrl) return;
		URL.revokeObjectURL(objectUrl);
		objectUrl = '';
	}
</script>

<div class="relative overflow-hidden bg-[#0f0f0d] {className}">
	{#if objectUrl}
		<img class="h-full w-full object-cover" src={objectUrl} {alt} />
	{:else if loading}
		<div class="grid h-full min-h-48 place-items-center text-[#6f6b5f]">
			<Loader2 class="h-5 w-5 animate-spin" />
		</div>
	{:else}
		<div class="grid h-full min-h-48 place-items-center text-[#6f6b5f]">
			<div class="flex flex-col items-center gap-2 text-xs">
				<ImageIcon class="h-5 w-5" />
				<span>{error || 'No image'}</span>
			</div>
		</div>
	{/if}
</div>
