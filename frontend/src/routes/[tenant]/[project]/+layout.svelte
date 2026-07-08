<script lang="ts">
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import {
        getProjectAccess,
        getProjectSettings,
        getProjectStats,
        isAbortError,
        type AccessResponse,
        type ProjectOverview,
        type ProjectSettings,
        type ProjectStats,
    } from "$lib/api";
    import { appData } from "$lib/appState";
    import { userDisplayName } from "$lib/identity";
    import { projectAppearanceStyle } from "$lib/projectAppearance";
    import { projectTabCount, projectTabs } from "$lib/projectChrome";
    import { startLogin } from "$lib/session";
    import ExternalLink from "lucide-svelte/icons/external-link";
    import StyLogo from "$lib/components/StyLogo.svelte";

    let { children } = $props();

    let signedIn = $state(false);
    let publicSettings = $state<ProjectSettings | null>(null);
    let publicStats = $state<ProjectStats | null>(null);
    let publicAccess = $state<AccessResponse | null>(null);
    let settingsOverride = $state<ProjectSettings | null>(null);
    let publicChromeKey = "";
    let settingsOverrideKey = "";

    const unsubscribe = appData.subscribe((value) => {
        signedIn = Boolean(value.me);
    });

    onDestroy(unsubscribe);

    const tenant = $derived($page.params.tenant as string);
    const project = $derived($page.params.project as string);
    const currentPath = $derived($page.url.pathname);
    const overview = $derived(
        ($page.data as { overview?: ProjectOverview | null }).overview ?? null,
    );
    const layoutChrome = $derived(
        (
            $page.data as {
                projectChrome?: {
                    settings: ProjectSettings | null;
                    stats: ProjectStats | null;
                    access: AccessResponse | null;
                };
            }
        ).projectChrome ?? null,
    );
    const settings = $derived(
        settingsOverride ?? publicSettings ?? overview?.settings ?? layoutChrome?.settings ?? null,
    );
    const stats = $derived<ProjectStats | null>(
        publicStats ?? overview?.stats ?? layoutChrome?.stats ?? null,
    );
    const access = $derived<AccessResponse | null>(
        publicAccess ?? overview?.access ?? layoutChrome?.access ?? null,
    );
    const tabs = $derived.by(() => projectTabs(settings?.navbar_items, "public"));
    const archivedAt = $derived(access?.archived_at ?? settings?.archived_at ?? null);
    const archivedBy = $derived(access?.archived_by ?? settings?.archived_by ?? null);
    const archivedByProfile = $derived(access?.archived_by_profile ?? settings?.archived_by_profile ?? null);
    const archivedByName = $derived(userDisplayName(archivedBy, archivedByProfile));
    const themeStyle = $derived(projectAppearanceStyle(settings?.appearance));

    $effect(() => {
        const key = `${tenant}/${project}/${signedIn ? "auth" : "public"}`;
        const projectKey = `${tenant}/${project}`;
        if (projectKey !== settingsOverrideKey) {
            settingsOverrideKey = projectKey;
            settingsOverride = null;
        }
        const hasCompleteChrome = settings !== null && stats !== null && access !== null;
        const shouldRefreshAuthedChrome =
            signedIn &&
            project.length > 0 &&
            publicChromeKey !== key &&
            (!access || access.source === "public" || !settings || !stats);
        const shouldLoadPublicChrome = !signedIn && !layoutChrome && !overview && !hasCompleteChrome;
        if (!shouldRefreshAuthedChrome && !shouldLoadPublicChrome) {
            return;
        }
        if (publicChromeKey === key) return;
        publicChromeKey = key;
        const controller = new AbortController();
        void loadProjectChrome(tenant, project, controller.signal);
        return () => controller.abort();
    });

    onMount(() => {
        const handleSettingsChanged = (event: Event) => {
            const detail = (event as CustomEvent<{ tenant: string; project: string; settings: ProjectSettings }>).detail;
            if (!detail || detail.tenant !== tenant || detail.project !== project) return;
            settingsOverride = detail.settings;
        };
        window.addEventListener("sty:project-settings-changed", handleSettingsChanged);
        return () => window.removeEventListener("sty:project-settings-changed", handleSettingsChanged);
    });

    function active(href: string) {
        return href === `/${tenant}/${project}`
            ? currentPath === href
            : currentPath.startsWith(href);
    }

    async function loadProjectChrome(
        tenant: string,
        project: string,
        signal: AbortSignal,
    ) {
        try {
            const [loadedSettings, loadedStats, loadedAccess] = await Promise.all([
                getProjectSettings(tenant, project, { signal }).catch(() => null),
                getProjectStats(tenant, project, { signal }).catch(() => null),
                getProjectAccess(tenant, project, { signal }).catch(() => null),
            ]);
            if (signal.aborted) return;
            publicSettings = loadedSettings;
            publicStats = loadedStats;
            publicAccess = loadedAccess;
        } catch (error) {
            if (isAbortError(error)) return;
            publicSettings = null;
            publicStats = null;
            publicAccess = null;
        }
    }

    function archiveDate(value: string | null) {
        return value ? new Date(value).toLocaleDateString() : "";
    }
</script>

<div class="sty-project-theme min-h-screen bg-[#0f0f0d]" style={themeStyle}>
{#if !signedIn}
    <div class="sty-project-nav border-b border-[#2a2a28] bg-[#0f0f0d]">
        <div class="px-32 md:px-48 lg:px-64 xl:px-80">
            <div class="flex items-center gap-4 py-2.5">
                <a href="/" class="sty-logo-link block shrink-0">
                    <StyLogo />
                </a>
                <div class="flex min-w-0 flex-1 items-center gap-0.5">
                    <a
                        class="flex min-w-0 items-center gap-1 rounded px-2 py-1 text-[18px] font-medium leading-5 text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#d9a66c]"
                        href="/{tenant}"
                        ><span class="truncate">{tenant}</span></a
                    >
                    <span class="text-[#5c5c5a]">/</span>
                    <a
                        class="flex min-w-0 items-center gap-1 rounded px-2 py-1 text-[18px] font-medium leading-5 text-[#eae9e4] hover:bg-[#1e1e1c] hover:text-[#d9a66c]"
                        href="/{tenant}/{project}"
                        ><span class="truncate">{project}</span></a
                    >
                </div>
                <button
                    class="rounded border border-[#2a2a28] px-3 py-1.5 text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
                    onclick={startLogin}
                >
                    Sign in
                </button>
            </div>
            <nav class="flex gap-1 overflow-x-auto">
                {#each tabs as tab (tab.id || tab.label)}
                    {#if tab.type === "link"}
                        {@const href = tab.url ?? "#"}
                        {@const isExternal = href.startsWith("http")}
                        <a
                            {href}
                            class="inline-flex items-center gap-0.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[#8c887e] hover:text-[#d9a66c]"
                            {...isExternal
                                ? {
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                  }
                                : {}}
                        >
                            {tab.label}
                            {#if isExternal}
                                <ExternalLink class="h-3 w-3" />
                            {/if}
                        </a>
                    {:else}
                        {@const href = tab.id
                            ? `/${tenant}/${project}/${tab.id}`
                            : `/${tenant}/${project}`}
                        {@const count = projectTabCount(stats, tab.id)}
                        <a
                            {href}
                            class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium {active(
                                href,
                            )
                                ? 'border-[#d9a66c] text-[#f0eee4]'
                                : 'border-transparent text-[#8c887e] hover:text-[#d9a66c]'}"
                        >
                            {tab.label}
                            {#if count !== null}
                                <span
                                    class="text-[11px] font-normal text-[#6f6b5f]"
                                    >{count}</span
                                >
                            {/if}
                        </a>
                    {/if}
                {/each}
            </nav>
        </div>
    </div>
{/if}

    <div class="px-4 py-6 md:px-48 lg:px-64 xl:px-80">
        {#if archivedAt}
            <div class="mb-4 rounded border border-[#2a2a28] bg-[#141412] px-4 py-3 text-sm text-[#a09d94]">
                This project was archived by {archivedByName} on {archiveDate(archivedAt)}. It is read-only.
            </div>
        {/if}
        {@render children()}
    </div>
</div>
