<script lang="ts">
    import { onMount } from "svelte";
    import ArrowLeft from "lucide-svelte/icons/arrow-left";
    import Check from "lucide-svelte/icons/check";
    import Copy from "lucide-svelte/icons/copy";
    import { unixInstallCommand, windowsInstallCommand } from "$lib/install";

    let installTarget = $state<"unix" | "windows">("unix");
    let copied = $state(false);

    const installCommand = $derived(
        installTarget === "windows"
            ? windowsInstallCommand
            : unixInstallCommand,
    );

    onMount(() => {
        const nav = navigator as Navigator & {
            userAgentData?: { platform?: string };
        };
        const platform =
            nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent;
        if (/win/i.test(platform)) installTarget = "windows";
    });

    async function copyInstall() {
        await navigator.clipboard.writeText(installCommand);
        copied = true;
        window.setTimeout(() => {
            copied = false;
        }, 1400);
    }
</script>

<svelte:head>
    <title>pig - isn't git</title>
    <meta
        name="description"
        content="PIG is workspace-first version control: save often, cram when it matters, sync when you are ready."
    />
    <meta property="og:title" content="pig - isn't git" />
    <meta
        property="og:description"
        content="Save often, cram when it matters, sync when you are ready."
    />
    <meta property="og:type" content="website" />
</svelte:head>

<main class="min-h-screen bg-[#0f0f0d] text-[#eae9e4]">
    <section class="mx-auto max-w-4xl px-6 py-16 md:py-24">
        <a
            class="mb-4 inline-flex items-center gap-2 text-sm text-[#8c887e] hover:text-[#eae9e4]"
            href="/"
        >
            <ArrowLeft class="h-4 w-4" />
            Go back to sty
        </a>

        <div class="max-w-3xl">
            <p
                class="text-7xl font-semibold tracking-tight text-[#f0eee4] md:text-8xl"
            >
                pig
            </p>
            <h1
                class="mt-3 text-4xl font-semibold tracking-tight text-[#d9a66c] italic md:text-5xl"
            >
                isn't git.
            </h1>
        </div>

        <div class="my-10 border-t border-[#2a2a28]"></div>

        <p class="max-w-2xl text-xl leading-8 text-[#eae9e4]">
            Git was designed for the Linux kernel in 2005. You are not
            maintaining the Linux kernel in 2005.
        </p>

        <div class="mt-8 grid max-w-3xl gap-4 text-base leading-7">
            <p>
                <code class="text-[#d9a66c]">pig save</code>
                <span class="text-[#8c887e]">
                    - no message required. just save. think later.</span
                >
            </p>
            <p>
                <code class="text-[#d9a66c]">pig cram "actually done"</code>
                <span class="text-[#8c887e]">
                    - squash the noise into something meaningful.</span
                >
            </p>
            <p>
                <code class="text-[#d9a66c]">pig sync</code>
                <span class="text-[#8c887e]">
                    - that's it. that's the whole thing.</span
                >
            </p>
        </div>

        <p class="mt-10 max-w-2xl text-lg leading-8 text-[#a09d94]">
            workspaces, not branches. save often, cram when it matters, sync
            when you're ready. your history stays clean without you having to
            manage it.
        </p>

        <p class="mt-6 max-w-2xl text-lg leading-8 text-[#a09d94]">
            built for the way you actually work - whether that's you, your team,
            or ten agents running in parallel.
        </p>

        <p class="mt-10 text-2xl font-semibold tracking-tight text-[#f0eee4]">
            pig isn't git. that's the point.
        </p>

        <div class="my-10 border-t border-[#2a2a28]"></div>

        <div class="max-w-3xl">
            <div
                class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
                <div class="inline-flex w-fit rounded bg-[#141412] p-1">
                    <button
                        class="rounded px-3 py-1.5 text-sm font-medium {installTarget ===
                        'unix'
                            ? 'bg-[#eae9e4] text-[#0f0f0d]'
                            : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                        type="button"
                        onclick={() => (installTarget = "unix")}
                    >
                        macOS / Linux
                    </button>
                    <button
                        class="rounded px-3 py-1.5 text-sm font-medium {installTarget ===
                        'windows'
                            ? 'bg-[#eae9e4] text-[#0f0f0d]'
                            : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                        type="button"
                        onclick={() => (installTarget = "windows")}
                    >
                        Windows
                    </button>
                </div>

                <button
                    class="inline-flex w-fit items-center gap-2 rounded border border-[#2a2a28] px-3 py-1.5 text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
                    type="button"
                    onclick={copyInstall}
                >
                    {#if copied}
                        <Check class="h-4 w-4" />
                        Copied
                    {:else}
                        <Copy class="h-4 w-4" />
                        Copy
                    {/if}
                </button>
            </div>

            <pre
                class="mt-4 overflow-x-auto rounded border border-[#2a2a28] bg-[#141412] px-4 py-4 text-sm leading-7 text-[#eae9e4]"><code
                    >{installCommand}</code
                ></pre>
            <p class="mt-3 text-sm leading-6 text-[#6f6b5f]">
                The installer asks whether to install both <code>sty</code> and
                <code>pig</code>, or just <code>pig</code>. Use
                <code>STY_INSTALL_DIR</code> to choose the install folder.
            </p>
        </div>
    </section>

    <footer class="border-t border-[#2a2a28] px-6 py-8">
        <div
            class="mx-auto flex max-w-4xl flex-col justify-between gap-3 text-xs text-[#6f6b5f] sm:flex-row"
        >
            <span>PIG isn't Git.</span>
            <nav class="flex gap-4">
                <a class="hover:text-[#d9a66c]" href="/docs/pig"
                    >Command guide</a
                >
                <a class="hover:text-[#d9a66c]" href="/privacy">Privacy</a>
                <a class="hover:text-[#d9a66c]" href="/terms">Terms</a>
            </nav>
        </div>
    </footer>
</main>
