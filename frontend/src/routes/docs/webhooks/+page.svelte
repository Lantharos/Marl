<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocsPage from '$lib/components/docs/DocsPage.svelte';
	import { webhookEvents, webhookPayloadJson } from '$lib/docs/protocol';

	const headers = `POST https://example.com/sty/webhook
content-type: application/json
x-sty-event: release.created
x-sty-delivery: del_...
x-sty-signature-256: sha256=<hex-hmac>`;

	const verify = `const expected = "sha256=" + hmacSha256Hex(secret, rawBody);
if (expected !== request.headers.get("x-sty-signature-256")) {
  return new Response("invalid signature", { status: 401 });
}`;
</script>

<svelte:head>
	<title>Webhooks - sty docs</title>
	<meta name="description" content="sty webhook events, delivery headers, payloads, and signature verification." />
</svelte:head>

<DocsPage
	title="Webhooks"
	description="Webhooks send project events to external systems. They are project-scoped, maintainer-managed, and designed for deployment, release, notification, and automation flows."
>
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Delivery</h2>
		<p class="mt-2 text-sm leading-6 text-[#8c887e]">Each delivery is a JSON POST. If a webhook has a secret, sty signs the raw payload with HMAC-SHA256 and sends the result in <code>x-sty-signature-256</code>.</p>
		<div class="mt-4 grid gap-4 lg:grid-cols-2">
			<CodeBlock code={headers} />
			<CodeBlock code={webhookPayloadJson} />
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">Events</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			{#each webhookEvents as event}
				<div class="grid gap-2 border-b border-[#252522] px-4 py-3 last:border-b-0 md:grid-cols-[220px_1fr]">
					<code class="text-sm text-[#d9a66c]">{event.event}</code>
					<p class="text-sm leading-6 text-[#a09d94]">{event.meaning}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div>
			<h2 class="text-lg font-semibold text-[#eae9e4]">Verify signatures</h2>
			<p class="mt-2 text-sm leading-6 text-[#8c887e]">Verify against the exact raw request body, not a re-serialized JSON object. Reject missing or mismatched signatures when a secret is configured.</p>
		</div>
		<CodeBlock code={verify} />
	</section>

	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">CLI</h2>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[250px_1fr]">
				<code class="text-sm text-[#d9a66c]">pig webhook new release.created https://example.com/hook</code>
				<p class="text-sm leading-6 text-[#a09d94]">Create a webhook when the remote supports webhooks.</p>
			</div>
			<div class="grid gap-2 border-b border-[#252522] px-4 py-3 md:grid-cols-[250px_1fr]">
				<code class="text-sm text-[#d9a66c]">pig webhook test &lt;id&gt;</code>
				<p class="text-sm leading-6 text-[#a09d94]">Send a test delivery.</p>
			</div>
			<div class="grid gap-2 px-4 py-3 md:grid-cols-[250px_1fr]">
				<code class="text-sm text-[#d9a66c]">pig webhook delete &lt;id&gt;</code>
				<p class="text-sm leading-6 text-[#a09d94]">Revoke the webhook.</p>
			</div>
		</div>
	</section>
</DocsPage>
