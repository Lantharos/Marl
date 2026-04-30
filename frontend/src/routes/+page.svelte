<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy, onMount } from "svelte";
    import { appData } from "$lib/appState";
    import { startLogin } from "$lib/session";
    import { unixInstallCommand, windowsInstallCommand } from "$lib/install";
    import {
        discoverProjects,
        getHome,
        isAbortError,
        type HomeResponse,
        type ProjectDiscoveryItem,
        type ProjectReleaseFeedItem,
    } from "$lib/api";
    import Spinner from "$lib/components/Spinner.svelte";

    let activeTab = $state<"projects" | "feed">("projects");
    let home = $state<HomeResponse | null>(null);
    let loading = $state(true);
    let error = $state("");
    let projectSearch = $state("");
    let publicSearch = $state("");
    let publicResults = $state<ProjectDiscoveryItem[] | null>(null);
    let searchBusy = $state(false);
    let loadedForUser = "";
    let signedIn = $state(false);
    let installPanelOpen = $state(false);
    let installTarget = $state<"unix" | "windows">("unix");

    const filteredProjects = $derived(
        home
            ? home.projects.filter((project) =>
                  matchesProject(project, projectSearch),
              )
            : [],
    );
    const installCommand = $derived(
        installTarget === "windows" ? windowsInstallCommand : unixInstallCommand,
    );

    const controller = new AbortController();
    const unsubscribe = appData.subscribe((data) => {
        if (!data.ready || !data.me) {
            signedIn = false;
            loading = false;
            home = null;
            loadedForUser = "";
            return;
        }
        signedIn = true;
        if (loadedForUser === data.me.user) return;
        loadedForUser = data.me.user;
        void loadHome();
    });

    onDestroy(() => {
        controller.abort();
        unsubscribe();
    });

    onMount(() => {
        const agent = navigator as Navigator & {
            userAgentData?: { platform?: string };
        };
        const platform =
            agent.userAgentData?.platform || navigator.platform || navigator.userAgent;
        if (/win/i.test(platform)) installTarget = "windows";
    });

    async function loadHome() {
        loading = true;
        error = "";
        try {
            home = await getHome({ signal: controller.signal });
        } catch (e) {
            if (isAbortError(e)) return;
            error = e instanceof Error ? e.message : "Failed";
        } finally {
            loading = false;
        }
    }

    async function runSearch() {
        const query = publicSearch.trim();
        if (!query) {
            publicResults = null;
            return;
        }
        searchBusy = true;
        try {
            publicResults = (
                await discoverProjects(query, {
                    signal: controller.signal,
                    perPage: 25,
                })
            ).items;
        } catch (e) {
            if (!isAbortError(e))
                error = e instanceof Error ? e.message : "Search failed";
        } finally {
            searchBusy = false;
        }
    }

    function projectPath(
        project: ProjectDiscoveryItem | ProjectReleaseFeedItem,
    ) {
        return `/${project.tenant}/${project.project}`;
    }

    function projectLabel(
        project: ProjectDiscoveryItem | ProjectReleaseFeedItem,
    ) {
        return `${project.tenant}/${project.project}`;
    }

    function matchesProject(project: ProjectDiscoveryItem, query: string) {
        const value = query.trim().toLowerCase();
        if (!value) return true;
        return projectLabel(project).toLowerCase().includes(value);
    }

    function releaseTitle(item: ProjectReleaseFeedItem) {
        return item.release.name || item.release.tag || "Release";
    }

    function timestamp(value?: string | null) {
        if (!value) return null;
        return new Date(value).toLocaleString();
    }

    function publicSearchInput() {
        if (!publicSearch.trim()) publicResults = null;
    }

    function publicSearchKeydown(event: KeyboardEvent) {
        if (event.key === "Enter") void runSearch();
    }
</script>

<svelte:head>
    <title>{signedIn ? "Home - sty" : "sty - PIG project hosting"}</title>
    <meta
        name="description"
        content={signedIn
            ? "Your sty projects and followed project releases."
            : "sty hosts PIG projects with workspaces, issues, releases, and code history."}
    />
    <meta
        property="og:title"
        content={signedIn ? "Home - sty" : "sty - PIG project hosting"}
    />
    <meta
        property="og:description"
        content={signedIn
            ? "Your sty projects and followed project releases."
            : "sty hosts PIG projects with workspaces, issues, releases, and code history."}
    />
    <meta property="og:type" content="website" />
</svelte:head>

{#if !signedIn}
    <main>
        <section class="px-6 pt-20 pb-16 md:px-12 lg:px-20">
            <div class="mx-auto max-w-4xl text-center">
                <h1
                    class="text-6xl font-bold tracking-tight text-[#f0eee4] md:text-7xl"
                >
                    sty
                </h1>
                <p class="mt-4 text-xl text-[#d9a66c] md:text-2xl">
                    where pigs ship code
                </p>
                <p class="mt-4 text-sm leading-6 text-[#8c887e] md:text-base">
                    Version control for humans who think in workspaces, not
                    branches.<br class="hidden md:block" />
                    Save, cram, and ship your code with confidence.
                </p>
                <div class="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                        class="rounded bg-[#eae9e4] px-6 py-2.5 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]"
                        type="button"
                        onclick={startLogin}
                    >
                        Sign in
                    </button>
                    <button
                        class="rounded border border-[#2a2a28] px-6 py-2.5 text-sm font-medium text-[#eae9e4] hover:bg-[#1e1e1c]"
                        type="button"
                        onclick={() => (installPanelOpen = !installPanelOpen)}
                    >
                        Install sty
                    </button>
                </div>
                {#if installPanelOpen}
                    <div class="mx-auto mt-5 max-w-xl text-left">
                        <div
                            class="flex items-center justify-between gap-3 rounded-t border border-b-0 border-[#2a2a28] bg-[#141412] px-3 py-2"
                        >
                            <span class="text-xs text-[#6f6b5f]"
                                >{installTarget === "windows"
                                    ? "Windows"
                                    : "macOS / Linux"}</span
                            >
                            <button
                                class="text-xs text-[#d9a66c] hover:text-[#eac38d]"
                                type="button"
                                onclick={() =>
                                    (installTarget =
                                        installTarget === "windows"
                                            ? "unix"
                                            : "windows")}
                            >
                                {installTarget === "windows"
                                    ? "Show macOS / Linux"
                                    : "Show Windows"}
                            </button>
                        </div>
                        <pre
                            class="overflow-x-auto rounded-b border border-[#2a2a28] bg-[#141412] px-4 py-3 text-sm leading-7 text-[#eae9e4]"><code>{installCommand}</code></pre>
                    </div>
                {/if}
            </div>
        </section>

        <section class="px-6 pb-16 md:px-12 lg:px-20">
            <div class="mx-auto max-w-2xl">
                <div class="rounded border border-[#2a2a28] bg-[#141412] p-5">
                    <div
                        class="flex items-center gap-2 border-b border-[#2a2a28] pb-3"
                    >
                        <span class="h-3 w-3 rounded-full bg-[#d96c5a]"></span>
                        <span class="h-3 w-3 rounded-full bg-[#d9a66c]"></span>
                        <span class="h-3 w-3 rounded-full bg-[#7cb97c]"></span>
                        <span class="ml-2 text-xs text-[#6f6b5f]">terminal</span
                        >
                    </div>
                    <pre
                        class="mt-4 overflow-x-auto text-sm leading-relaxed text-[#a09d94]"><code
                            ><span class="text-[#6f6b5f]"># sign in to sty</span
                            >
<span class="text-[#eae9e4]">$ sty login</span>

<span class="text-[#6f6b5f]"># connect this repo</span>
<span class="text-[#eae9e4]">$ sty init tenant/project</span>

<span class="text-[#6f6b5f]"># create a workspace</span>
<span class="text-[#eae9e4]">$ pig work new feature-x</span>

<span class="text-[#6f6b5f]"># save your progress</span>
<span class="text-[#eae9e4]">$ pig save "add user auth"</span>

<span class="text-[#6f6b5f]"># squash unsaved work</span>
<span class="text-[#eae9e4]">$ pig cram "polish auth flow"</span>

<span class="text-[#6f6b5f]"># sync to sty</span>
<span class="text-[#eae9e4]">$ pig sync</span>

<span class="text-[#6f6b5f]"># mark work ready</span>
<span class="text-[#eae9e4]">$ pig work ready</span></code
                        ></pre>
                </div>
            </div>
        </section>

        <section class="px-6 pb-16 md:px-12 lg:px-20">
            <div class="mx-auto max-w-4xl border-y border-[#2a2a28] py-6">
                <div
                    class="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-center"
                >
                    <div>
                        <h2 class="text-lg font-semibold text-[#f0eee4]">
                            New to sty?
                        </h2>
                        <p class="mt-1 text-sm leading-6 text-[#8c887e]">
                            Start with the product docs, or read about the local
                            PIG workflow first.
                        </p>
                    </div>
                    <a
                        class="rounded border border-[#2a2a28] px-4 py-2 text-sm font-medium text-[#d9a66c] hover:bg-[#1e1e1c]"
                        href="/docs">Read docs</a
                    >
                    <a
                        class="rounded border border-[#2a2a28] px-4 py-2 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
                        href="/pig">Meet PIG</a
                    >
                </div>
            </div>
        </section>

        <section class="px-6 pb-20 md:px-12 lg:px-20">
            <div
                class="mx-auto grid max-w-4xl gap-10 border-b border-[#2a2a28] pb-14 md:grid-cols-[minmax(0,1.12fr)_minmax(260px,0.88fr)]"
            >
                <div>
                    <p
                        class="text-3xl font-semibold leading-tight tracking-tight text-[#f0eee4] md:text-4xl"
                    >
                        GitHub is slow. Forgejo is ugly. GitLab is a second job.
                    </p>
                    <p class="mt-5 text-xl leading-8 text-[#d9a66c]">
                        You just want to push code, track issues, and ship.
                    </p>
                    <p class="text-xl leading-8 text-[#d9a66c]">So do we.</p>

                    <p class="mt-6 text-base leading-7 text-[#a09d94]">
                        Sty is the hosted home for PIG - fast, minimal, and
                        built for the way modern teams actually work. No star
                        counts to game. No bloat to navigate. Just your code,
                        your workspaces, and your team.
                    </p>
                </div>

                <div class="grid content-start gap-5 text-sm leading-6">
                    <p class="border-l border-[#3a3a36] pl-4 text-[#a09d94]">
                        <span class="font-semibold text-[#f0eee4]">Fast.</span>
                        Like, actually fast. Not "we're working on it" fast.
                    </p>
                    <p class="border-l border-[#3a3a36] pl-4 text-[#a09d94]">
                        <span class="font-semibold text-[#f0eee4]">Simple.</span
                        >
                        One place for code, issues, and releases. Nothing else.
                    </p>
                    <p class="border-l border-[#3a3a36] pl-4 text-[#a09d94]">
                        <span class="font-semibold text-[#f0eee4]">Honest.</span
                        >
                        No vanity metrics. Follow projects you care about, nothing
                        to game.
                    </p>
                    <p class="border-l border-[#3a3a36] pl-4 text-[#a09d94]">
                        <span class="font-semibold text-[#f0eee4]"
                            >Runs at the edge.</span
                        >
                        Doesn't fall over.
                    </p>
                    <div
                        class="mt-2 border-l border-[#d9a66c] pl-4 font-mono text-sm leading-7"
                    >
                        <div>
                            <span class="text-[#d9a66c]">sty login</span><span
                                class="text-[#8c887e]"
                            >
                                - you're in.</span
                            >
                        </div>
                        <div>
                            <span class="text-[#d9a66c]">pig sync</span><span
                                class="text-[#8c887e]"
                            >
                                - your code is here.</span
                            >
                        </div>
                        <div class="text-[#f0eee4]">that's really it.</div>
                    </div>
                </div>
            </div>
        </section>

        <section class="px-6 pb-20 md:px-12 lg:px-20">
            <div class="mx-auto max-w-4xl">
                <h2 class="text-center text-lg font-semibold text-[#eae9e4]">
                    What sty gives you
                </h2>
                <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div
                        class="rounded border border-[#2a2a28] bg-[#141412] p-5"
                    >
                        <div class="text-lg font-semibold text-[#eae9e4]">
                            Workspaces
                        </div>
                        <p class="mt-2 text-sm text-[#8c887e]">
                            Branch-less version control. Create workspaces from
                            any parent, not just main.
                        </p>
                    </div>
                    <div
                        class="rounded border border-[#2a2a28] bg-[#141412] p-5"
                    >
                        <div class="text-lg font-semibold text-[#eae9e4]">
                            Saves & Crams
                        </div>
                        <p class="mt-2 text-sm text-[#8c887e]">
                            Lightweight checkpoints you can squash. No more WIP
                            commits.
                        </p>
                    </div>
                    <div
                        class="rounded border border-[#2a2a28] bg-[#141412] p-5"
                    >
                        <div class="text-lg font-semibold text-[#eae9e4]">
                            Ready to Ship
                        </div>
                        <p class="mt-2 text-sm text-[#8c887e]">
                            Mark workspaces as ready, review diffs, and merge
                            with confidence.
                        </p>
                    </div>
                    <div
                        class="rounded border border-[#2a2a28] bg-[#141412] p-5"
                    >
                        <div class="text-lg font-semibold text-[#eae9e4]">
                            Code Browser
                        </div>
                        <p class="mt-2 text-sm text-[#8c887e]">
                            Browse any workspace's files with syntax
                            highlighting right in the browser.
                        </p>
                    </div>
                    <div
                        class="rounded border border-[#2a2a28] bg-[#141412] p-5"
                    >
                        <div class="text-lg font-semibold text-[#eae9e4]">
                            History
                        </div>
                        <p class="mt-2 text-sm text-[#8c887e]">
                            Full history with diffs for every save, cram, and
                            ship. See exactly what changed.
                        </p>
                    </div>
                    <div
                        class="rounded border border-[#2a2a28] bg-[#141412] p-5"
                    >
                        <div class="text-lg font-semibold text-[#eae9e4]">
                            Issues
                        </div>
                        <p class="mt-2 text-sm text-[#8c887e]">
                            Track bugs and features alongside your code. Comment
                            and close when done.
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <footer class="border-t border-[#2a2a28] px-6 py-8 md:px-12 lg:px-20">
            <div
                class="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 text-xs text-[#6f6b5f] sm:flex-row"
            >
                <span
                    >sty is operated by <a
                        class="hover:text-[#d9a66c]"
                        href="https://lantharos.com"
                        rel="noreferrer">Lantharos</a
                    >.</span
                >
                <nav class="flex gap-4">
                    <a class="hover:text-[#d9a66c]" href="/docs">Docs</a>
                    <a class="hover:text-[#d9a66c]" href="/pig">PIG</a>
                    <a class="hover:text-[#d9a66c]" href="/privacy">Privacy</a>
                    <a class="hover:text-[#d9a66c]" href="/terms">Terms</a>
                </nav>
            </div>
        </footer>
    </main>
{:else}
    <div class="p-8">
        <div class="mx-auto max-w-5xl">
            <div class="flex items-end justify-between gap-4">
                <div>
                    <h2 class="text-2xl font-semibold text-[#f0eee4]">Home</h2>
                    <p class="mt-1 text-sm text-[#8c887e]">
                        Projects you work on and releases from projects you
                        follow.
                    </p>
                </div>
                <div class="flex rounded bg-[#141412] p-1">
                    <button
                        class="rounded px-3 py-1.5 text-sm font-medium {activeTab ===
                        'projects'
                            ? 'bg-[#eae9e4] text-[#0f0f0d]'
                            : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                        onclick={() => (activeTab = "projects")}
                    >
                        Projects
                    </button>
                    <button
                        class="rounded px-3 py-1.5 text-sm font-medium {activeTab ===
                        'feed'
                            ? 'bg-[#eae9e4] text-[#0f0f0d]'
                            : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                        onclick={() => (activeTab = "feed")}
                    >
                        Feed
                    </button>
                </div>
            </div>

            {#if loading}
                <div class="mt-16 grid place-items-center">
                    <Spinner />
                </div>
            {:else if error}
                <p class="mt-8 text-sm text-[#d96c5a]">{error}</p>
            {:else if home}
                {#if activeTab === "projects"}
                    <section class="mt-6">
                        <div
                            class="mb-3 flex items-center justify-between gap-3"
                        >
                            <div>
                                <h3 class="text-sm font-medium text-[#eae9e4]">
                                    Projects
                                </h3>
                            </div>
                            <input
                                class="h-9 w-72 max-w-full rounded border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a36]"
                                placeholder="Search projects"
                                bind:value={projectSearch}
                            />
                        </div>
                        {#if home.projects.length === 0}
                            <div
                                class="rounded border border-[#2a2a28] p-8 text-center"
                            >
                                <p class="text-sm text-[#8c887e]">
                                    No projects yet.
                                </p>
                                <p class="mt-1 text-xs text-[#6f6b5f]">
                                    Run <code
                                        class="rounded bg-[#1e1e1c] px-1 py-0.5"
                                        >sty init tenant/project</code
                                    > from a repository.
                                </p>
                            </div>
                        {:else if filteredProjects.length === 0}
                            <div
                                class="rounded border border-[#2a2a28] p-8 text-center"
                            >
                                <p class="text-sm text-[#8c887e]">
                                    No projects match that search.
                                </p>
                            </div>
                        {:else}
                            <div
                                class="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
                            >
                                {#each filteredProjects as project}
                                    <button
                                        class="min-h-28 rounded border border-[#2a2a28] bg-[#141412] p-4 text-left hover:border-[#3a3a36] hover:bg-[#1a1a18]"
                                        onclick={() =>
                                            goto(projectPath(project))}
                                    >
                                        <div
                                            class="truncate text-sm font-medium text-[#f0eee4]"
                                        >
                                            {projectLabel(project)}
                                        </div>
                                        <div
                                            class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6f6b5f]"
                                        >
                                            <span
                                                >{project.stats.workspace_count} workspaces</span
                                            >
                                            <span
                                                >{project.stats
                                                    .open_issue_count} issues</span
                                            >
                                            <span
                                                >{project.stats.release_count} releases</span
                                            >
                                        </div>
                                        {#if timestamp(project.last_activity_at)}
                                            <div
                                                class="mt-5 text-xs text-[#6f6b5f]"
                                            >
                                                {timestamp(
                                                    project.last_activity_at,
                                                )}
                                            </div>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </section>
                {:else}
                    <section class="mt-6">
                        <div class="mb-3 flex items-end justify-between gap-3">
                            <div>
                                <h3 class="text-sm font-medium text-[#eae9e4]">
                                    Feed
                                </h3>
                                <p class="mt-0.5 text-xs text-[#6f6b5f]">
                                    Releases from followed public projects.
                                </p>
                            </div>
                            <div class="flex w-full max-w-md gap-2">
                                <input
                                    class="h-9 min-w-0 flex-1 rounded border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a36]"
                                    placeholder="Search public projects"
                                    bind:value={publicSearch}
                                    oninput={publicSearchInput}
                                    onkeydown={publicSearchKeydown}
                                />
                                <button
                                    class="rounded border border-[#2a2a28] px-3 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
                                    disabled={searchBusy}
                                    onclick={runSearch}
                                >
                                    {searchBusy ? "Searching" : "Search"}
                                </button>
                            </div>
                        </div>

                        <div
                            class="overflow-hidden rounded border border-[#2a2a28] bg-[#141412]"
                        >
                            {#if publicResults}
                                {#each publicResults as project}
                                    <button
                                        class="block w-full border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                        onclick={() =>
                                            goto(projectPath(project))}
                                    >
                                        <div
                                            class="truncate text-sm font-medium text-[#f0eee4]"
                                        >
                                            {projectLabel(project)}
                                        </div>
                                        <div
                                            class="mt-1 flex gap-2 text-xs text-[#6f6b5f]"
                                        >
                                            <span
                                                >{project.stats
                                                    .open_issue_count} issues</span
                                            >
                                            <span
                                                >{project.stats.release_count} releases</span
                                            >
                                        </div>
                                    </button>
                                {:else}
                                    <p
                                        class="px-4 py-8 text-center text-sm text-[#6f6b5f]"
                                    >
                                        No public projects found.
                                    </p>
                                {/each}
                            {:else if home.releases.length > 0}
                                {#each home.releases as item}
                                    <button
                                        class="flex w-full items-center justify-between gap-4 border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                        onclick={() =>
                                            goto(
                                                `${projectPath(item)}/releases`,
                                            )}
                                    >
                                        <div class="min-w-0">
                                            <div
                                                class="truncate text-sm font-medium text-[#f0eee4]"
                                            >
                                                {releaseTitle(item)}
                                            </div>
                                            <div
                                                class="mt-1 truncate text-xs text-[#6f6b5f]"
                                            >
                                                {projectLabel(item)} / {item
                                                    .release.tag}
                                            </div>
                                        </div>
                                        <div
                                            class="shrink-0 text-xs text-[#6f6b5f]"
                                        >
                                            {timestamp(item.released_at)}
                                        </div>
                                    </button>
                                {/each}
                            {:else if home.following.length > 0}
                                {#each home.following as project}
                                    <button
                                        class="flex w-full items-center justify-between gap-4 border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                        onclick={() =>
                                            goto(projectPath(project))}
                                    >
                                        <div class="min-w-0">
                                            <div
                                                class="truncate text-sm font-medium text-[#f0eee4]"
                                            >
                                                {projectLabel(project)}
                                            </div>
                                            <div
                                                class="mt-1 text-xs text-[#6f6b5f]"
                                            >
                                                {project.latest_release
                                                    ? `Latest release ${project.latest_release.tag}`
                                                    : "No releases yet"}
                                            </div>
                                        </div>
                                        {#if timestamp(project.last_activity_at)}
                                            <div
                                                class="shrink-0 text-xs text-[#6f6b5f]"
                                            >
                                                {timestamp(
                                                    project.last_activity_at,
                                                )}
                                            </div>
                                        {/if}
                                    </button>
                                {/each}
                            {:else}
                                <p
                                    class="px-4 py-8 text-center text-sm text-[#6f6b5f]"
                                >
                                    Follow public projects to track new releases
                                    here.
                                </p>
                            {/if}
                        </div>
                    </section>
                {/if}
            {/if}
        </div>
    </div>
{/if}
