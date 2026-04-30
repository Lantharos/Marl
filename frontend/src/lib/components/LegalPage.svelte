<script lang="ts">
	let {
		title,
		description,
		effective,
		children
	}: {
		title: string;
		description: string;
		effective: string;
		children: import('svelte').Snippet;
	} = $props();
</script>

<main class="min-h-screen bg-[#0f0f0d] text-[#eae9e4]">
	<header class="border-b border-[#2a2a28]">
		<div class="mx-auto flex max-w-4xl items-center justify-center px-6 py-4">
			<a href="/" class="text-lg font-bold tracking-tight text-[#f0eee4]">sty</a>
		</div>
	</header>

	<article class="mx-auto max-w-4xl px-6 py-12">
		<header class="border-b border-[#2a2a28] pb-7">
			<h1 class="text-3xl font-semibold tracking-tight text-[#f0eee4]">{title}</h1>
			<p class="mt-3 max-w-2xl text-sm leading-6 text-[#8c887e]">{description}</p>
			<p class="mt-4 text-xs text-[#6f6b5f]">Effective {effective}</p>
		</header>
		<div class="mt-8 grid gap-8">
			{@render children()}
		</div>
		<footer class="mt-10 border-t border-[#2a2a28] pt-5 text-xs leading-5 text-[#6f6b5f]">
			sty is operated by <a class="text-[#a09d94] hover:text-[#d9a66c]" href="https://lantharos.com" rel="noreferrer">Lantharos</a>.
		</footer>
	</article>
</main>
