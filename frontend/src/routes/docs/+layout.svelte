<script lang="ts">
	import { page } from '$app/stores';
	import { docsNav } from '$lib/docs/navigation';

	let { children } = $props();
	const path = $derived($page.url.pathname.replace(/\/$/, '') || '/docs');
	const groups = ['Start', 'Work', 'Build'];
</script>

<svelte:head>
	<link rel="alternate" type="text/plain" href="/docs/llms.txt" />
</svelte:head>

<div class="min-h-screen bg-[#0f0f0d] text-[#eae9e4]">
	<header class="border-b border-[#2a2a28] bg-[#0f0f0d]">
		<div class="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
			<nav class="flex items-center gap-3 text-sm">
				<a href="/" class="text-lg font-bold tracking-tight text-[#f0eee4]">sty</a>
				<span class="text-[#6f6b5f]">/</span>
				<a href="/docs" class="font-medium text-[#eae9e4]">docs</a>
			</nav>
		</div>
	</header>

	<div class="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[250px_minmax(0,1fr)]">
		<aside class="lg:sticky lg:top-6 lg:self-start">
			<nav class="grid gap-5">
				{#each groups as group}
					<div>
						<div class="px-3 text-xs font-medium text-[#6f6b5f]">{group}</div>
						<div class="mt-1 grid gap-1">
							{#each docsNav.filter((item) => item.group === group) as item}
								<a
									href={item.href}
									class="rounded px-3 py-2 text-sm {path === item.href ? 'bg-[#1a1a18] text-[#f0eee4]' : 'text-[#8c887e] hover:bg-[#141412] hover:text-[#eae9e4]'}"
								>
									{item.title}
								</a>
							{/each}
						</div>
					</div>
				{/each}
			</nav>
			<a class="mt-4 block px-3 text-xs text-[#6f6b5f] hover:text-[#d9a66c]" href="/docs/llms.txt">llms.txt</a>
		</aside>

		<main class="min-w-0">
			{@render children()}
			<footer class="mt-12 border-t border-[#2a2a28] py-6 text-xs text-[#6f6b5f]">
				<nav class="flex flex-wrap gap-4">
					<a class="hover:text-[#d9a66c]" href="/privacy">Privacy</a>
					<a class="hover:text-[#d9a66c]" href="/terms">Terms</a>
				</nav>
			</footer>
		</main>
	</div>
</div>
