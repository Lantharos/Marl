<script lang="ts">
	let {
		title,
		description,
		children
	}: {
		title: string;
		description: string;
		children: import('svelte').Snippet;
	} = $props();
</script>

<article class="pb-16">
	<header class="border-b border-[#2a2a28] pb-7">
		<h1 class="text-3xl font-semibold tracking-tight text-[#f0eee4]">{title}</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-[#8c887e]">{description}</p>
	</header>
	<div class="mt-8 grid gap-8">
		{@render children()}
	</div>
</article>
