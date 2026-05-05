<script lang="ts">
	import { page } from '$app/stores';

	function goBack() {
		globalThis.history.back();
	}
</script>

<svelte:head>
	<title>{$page.status === 404 ? '404 - sty' : `${$page.status} - sty`}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="grid min-h-screen place-items-center bg-[#0f0f0d] px-6">
	<div class="w-full max-w-xl">
		<a href="/" class="text-lg font-bold tracking-tight text-[#f0eee4]">sty</a>
		<div class="mt-12 border-l border-[#2a2a28] pl-6">
			<div class="font-mono text-sm text-[#6f6b5f]">HTTP {$page.status}</div>
			<h1 class="mt-3 text-4xl font-semibold tracking-tight text-[#f0eee4]">
				{$page.status === 404 ? 'This URL did not compile.' : 'The request tripped on the way out.'}
			</h1>
			<p class="mt-4 text-sm leading-6 text-[#8c887e]">
				{$page.status === 404
					? 'No tenant, project, workspace, or route matched that path. The compiler checked twice.'
					: $page.error?.message || 'Something failed while sty was resolving this page.'}
			</p>
			<div class="mt-7 flex flex-wrap items-center gap-3">
				<a
					class="inline-flex h-10 items-center rounded bg-[#eae9e4] px-4 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]"
					href="/"
				>
					Go home
				</a>
				<button
					class="inline-flex h-10 items-center rounded border border-[#2a2a28] px-4 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
					onclick={goBack}
				>
					Back
				</button>
			</div>
		</div>
	</div>
</main>
