<script lang="ts">
	let { children } = $props();
</script>

<div class="px-4 py-6 md:px-8 lg:px-16 xl:px-32">
	{@render children()}
</div>
