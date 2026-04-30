<script lang="ts">
	let {
		code,
		label
	}: {
		code: string;
		label?: string;
	} = $props();
</script>

<div class="overflow-hidden rounded border border-[#2a2a28] bg-[#11110f]">
	{#if label}
		<div class="border-b border-[#252522] px-4 py-2 text-xs text-[#6f6b5f]">{label}</div>
	{/if}
	<pre class="overflow-x-auto p-4 text-sm leading-6 text-[#d8d6cc]"><code>{code}</code></pre>
</div>
