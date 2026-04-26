<script lang="ts">
	let { children } = $props();
</script>

<div class="px-4 py-6 md:px-48 lg:px-64 xl:px-80">
	{@render children()}
</div>
