<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import ContentComposer from './ContentComposer.svelte';

	let props: ComponentProps<typeof ContentComposer> = $props();
</script>

<ContentComposer {...props} />
