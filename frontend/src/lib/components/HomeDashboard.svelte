<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        discoverProjects,
        isAbortError,
        type HomeActivityItem,
        type HomeIssueItem,
        type HomeMentionItem,
        type HomeReadyWorkspace,
        type HomeResponse,
        type ProjectDiscoveryItem,
    } from "$lib/api";
    import { userDisplayName, withoutOpaqueUserIds } from "$lib/identity";
    import Spinner from "$lib/components/Spinner.svelte";
    import AtSign from "lucide-svelte/icons/at-sign";
    import CircleCheck from "lucide-svelte/icons/circle-check";
    import GitPullRequest from "lucide-svelte/icons/git-pull-request";
    import Loader2 from "lucide-svelte/icons/loader-2";

    let {
        home,
        loading,
        error,
    }: { home: HomeResponse | null; loading: boolean; error: string } = $props();

    type AttentionFilter = "all" | "workspaces" | "issues";
    type ActivityScope = "projects" | "following";

    let activeTab = $state<"overview" | "activity">("overview");
    let attentionFilter = $state<AttentionFilter>("all");
    let activityScope = $state<ActivityScope>("projects");
    let projectSearch = $state("");
    let publicSearch = $state("");
    let publicResults = $state<ProjectDiscoveryItem[] | null>(null);
    let searchBusy = $state(false);
    const attentionFilters: AttentionFilter[] = ["all", "workspaces", "issues"];

    const filteredProjects = $derived(
        home
            ? home.projects.filter((project) =>
                  projectLabel(project).toLowerCase().includes(projectSearch.trim().toLowerCase()),
              )
            : [],
    );
    const attentionCount = $derived(
        (home?.attention.ready_workspaces.length ?? 0) +
            (home?.attention.assigned_issues.length ?? 0) +
            (home?.attention.mentions.length ?? 0),
    );
    const visibleReadyWorkspaces = $derived(
        attentionFilter === "all" || attentionFilter === "workspaces"
            ? (home?.attention.ready_workspaces ?? [])
            : [],
    );
    const visibleAssignedIssues = $derived(
        attentionFilter === "all" || attentionFilter === "issues"
            ? (home?.attention.assigned_issues ?? [])
            : [],
    );
    const visibleMentions = $derived(
        attentionFilter === "all" || attentionFilter === "issues"
            ? (home?.attention.mentions ?? [])
            : [],
    );
    const visibleAttentionCount = $derived(
        visibleReadyWorkspaces.length + visibleAssignedIssues.length + visibleMentions.length,
    );
    const currentActivity = $derived(
        activityScope === "projects"
            ? (home?.project_activity ?? home?.activity ?? [])
            : (home?.followed_activity ?? home?.activity ?? []),
    );
    const recentActivity = $derived(currentActivity.slice(0, 5));

    async function runSearch() {
        const query = publicSearch.trim();
        if (!query) {
            publicResults = null;
            return;
        }
        searchBusy = true;
        try {
            publicResults = (await discoverProjects(query, { perPage: 25 })).items;
        } catch (e) {
            if (!isAbortError(e)) publicResults = [];
        } finally {
            searchBusy = false;
        }
    }

    function projectPath(project: ProjectDiscoveryItem) {
        return `/${project.tenant}/${project.project}`;
    }

    function projectLabel(project: ProjectDiscoveryItem | HomeReadyWorkspace | HomeIssueItem | HomeMentionItem | HomeActivityItem) {
        return `${project.tenant}/${project.project}`;
    }

    function workspacePath(item: HomeReadyWorkspace) {
        return `/${item.tenant}/${item.project}/workspaces/${encodeURIComponent(item.workspace)}`;
    }

    function issuePath(item: HomeIssueItem | HomeMentionItem) {
        const issue = "issue" in item ? item.issue.id : item.issue_id;
        return `/${item.tenant}/${item.project}/issues/${encodeURIComponent(issue)}`;
    }

    function timestamp(value?: string | null) {
        if (!value) return "";
        return new Date(value).toLocaleString();
    }

    function shortHash(value?: string | null) {
        return value ? value.slice(0, 10) : "no head";
    }

    function issueMeta(item: HomeIssueItem) {
        const assignees = item.issue.assignees?.length ? `${item.issue.assignees.length} assigned` : "assigned";
        return `${projectLabel(item)} / #${item.issue.number} / ${assignees}`;
    }

    function mentionBody(item: HomeMentionItem) {
        return withoutOpaqueUserIds(item.body).replace(/\s+/g, " ").trim();
    }

    function activityDetail(item: HomeActivityItem) {
        const parts = [projectLabel(item)];
        if (item.workspace) parts.push(item.workspace);
        const actor = item.actor ? userDisplayName(item.actor, item.actor_profile) : null;
        if (actor) parts.push(actor);
        return parts.join(" / ");
    }

    function publicSearchInput() {
        if (!publicSearch.trim()) publicResults = null;
    }

    function publicSearchKeydown(event: KeyboardEvent) {
        if (event.key === "Enter") void runSearch();
    }

    function attentionFilterLabel(filter: AttentionFilter) {
        if (filter === "workspaces") return "Workspaces";
        if (filter === "issues") return "Issues";
        return "All";
    }
</script>

<div class="p-8">
    <div class="mx-auto max-w-5xl">
        <div class="flex items-end justify-between gap-4">
            <div>
                <h2 class="text-2xl font-semibold text-[#f0eee4]">Home</h2>
                <p class="mt-1 text-sm text-[#8c887e]">
                    What needs your attention right now.
                </p>
            </div>
            <div class="flex rounded bg-[#141412] p-1">
                <button
                    class="rounded px-3 py-1.5 text-sm font-medium {activeTab ===
                    'overview'
                        ? 'bg-[#eae9e4] text-[#0f0f0d]'
                        : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                    onclick={() => (activeTab = "overview")}
                >
                    Overview
                    {#if attentionCount > 0}
                        <span class="ml-1 text-xs">{attentionCount}</span>
                    {/if}
                </button>
                <button
                    class="rounded px-3 py-1.5 text-sm font-medium {activeTab ===
                    'activity'
                        ? 'bg-[#eae9e4] text-[#0f0f0d]'
                        : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                    onclick={() => (activeTab = "activity")}
                >
                    Activity
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
            {#if activeTab === "overview"}
                <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <section class="min-w-0">
                        {#if attentionCount === 0}
                            <div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
                                <CircleCheck class="mx-auto h-7 w-7 text-[#7cb97c]" />
                                <p class="mt-3 text-sm font-medium text-[#eae9e4]">
                                    You're all caught up.
                                </p>
                                <p class="mt-1 text-sm text-[#6f6b5f]">
                                    No ready workspaces, assigned issues, or mentions need you.
                                </p>
                            </div>
                        {:else}
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <h3 class="text-sm font-medium text-[#eae9e4]">Needs attention</h3>
                                <div class="flex rounded bg-[#141412] p-1">
                                    {#each attentionFilters as item}
                                        <button
                                            class="rounded px-2.5 py-1 text-xs font-medium {attentionFilter === item
                                                ? 'bg-[#eae9e4] text-[#0f0f0d]'
                                                : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                                            onclick={() => (attentionFilter = item)}
                                        >
                                            {attentionFilterLabel(item)}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                            <div class="overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
                                {#each visibleReadyWorkspaces as item}
                                    <button
                                        class="flex w-full gap-3 border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                        onclick={() => goto(workspacePath(item))}
                                    >
                                        <GitPullRequest class="mt-0.5 h-4 w-4 shrink-0 text-[#d9a66c]" />
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate text-sm font-medium text-[#f0eee4]">
                                                {item.workspace} is ready for review
                                            </span>
                                            <span class="mt-1 block truncate text-xs text-[#6f6b5f]">
                                                {projectLabel(item)} / {userDisplayName(item.author, item.author_profile)} / {shortHash(item.head)}
                                                {#if item.marked_at}
                                                    / {timestamp(item.marked_at)}
                                                {/if}
                                            </span>
                                        </span>
                                    </button>
                                {/each}
                                {#each visibleAssignedIssues as item}
                                    <button
                                        class="flex w-full gap-3 border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                        onclick={() => goto(issuePath(item))}
                                    >
                                        <CircleCheck class="mt-0.5 h-4 w-4 shrink-0 text-[#6ba4c7]" />
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate text-sm font-medium text-[#f0eee4]">
                                                #{item.issue.number} {item.issue.title}
                                            </span>
                                            <span class="mt-1 block truncate text-xs text-[#6f6b5f]">
                                                {issueMeta(item)} / updated {timestamp(item.issue.updated_at)}
                                            </span>
                                        </span>
                                    </button>
                                {/each}
                                {#each visibleMentions as item}
                                    <button
                                        class="flex w-full gap-3 border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                        onclick={() => goto(issuePath(item))}
                                    >
                                        <AtSign class="mt-0.5 h-4 w-4 shrink-0 text-[#d9a66c]" />
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate text-sm font-medium text-[#f0eee4]">
                                                Mentioned in #{item.issue_number} {item.issue_title}
                                            </span>
                                            <span class="mt-1 block truncate text-xs text-[#6f6b5f]">
                                                {projectLabel(item)} / {userDisplayName(item.author, item.author_profile)} / {mentionBody(item)}
                                            </span>
                                        </span>
                                    </button>
                                {:else}
                                    {#if visibleAttentionCount === 0}
                                        <p class="px-4 py-8 text-center text-sm text-[#6f6b5f]">
                                            Nothing in this view.
                                        </p>
                                    {/if}
                                {/each}
                            </div>
                        {/if}

                        <div class="mt-6">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <h3 class="text-sm font-medium text-[#eae9e4]">Recent activity</h3>
                                <div class="flex rounded bg-[#141412] p-1">
                                    <button
                                        class="rounded px-2.5 py-1 text-xs font-medium {activityScope === 'projects'
                                            ? 'bg-[#eae9e4] text-[#0f0f0d]'
                                            : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                                        onclick={() => (activityScope = "projects")}
                                    >
                                        Your projects
                                    </button>
                                    <button
                                        class="rounded px-2.5 py-1 text-xs font-medium {activityScope === 'following'
                                            ? 'bg-[#eae9e4] text-[#0f0f0d]'
                                            : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                                        onclick={() => (activityScope = "following")}
                                    >
                                        Following
                                    </button>
                                </div>
                            </div>
                            {#if recentActivity.length > 0}
                                <div class="mt-3 overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
                                    {#each recentActivity as item}
                                        <a class="block border-b border-[#252522] px-4 py-3 last:border-b-0 hover:bg-[#1a1a18]" href={item.href}>
                                            <div class="truncate text-sm font-medium text-[#f0eee4]">{item.title}</div>
                                            <div class="mt-1 truncate text-xs text-[#6f6b5f]">
                                                {activityDetail(item)} / {timestamp(item.timestamp)}
                                            </div>
                                        </a>
                                    {/each}
                                </div>
                            {:else}
                                <p class="rounded border border-[#2a2a28] px-4 py-8 text-center text-sm text-[#6f6b5f]">
                                    No recent activity.
                                </p>
                            {/if}
                        </div>
                    </section>

                    <aside class="min-w-0">
                        <div class="mb-3 flex items-center justify-between gap-3">
                            <h3 class="text-sm font-medium text-[#eae9e4]">Projects</h3>
                            <input
                                class="h-9 w-44 rounded border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a36]"
                                placeholder="Search projects"
                                bind:value={projectSearch}
                            />
                        </div>
                        <div class="overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
                            {#each filteredProjects.slice(0, 12) as project}
                                <button
                                    class="block w-full border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                    onclick={() => goto(projectPath(project))}
                                >
                                    <div class="truncate text-sm font-medium text-[#f0eee4]">{projectLabel(project)}</div>
                                    <div class="mt-1 flex gap-2 text-xs text-[#6f6b5f]">
                                        <span>{project.stats.ready_count} ready</span>
                                        <span>{project.stats.open_issue_count} issues</span>
                                    </div>
                                </button>
                            {:else}
                                <p class="px-4 py-8 text-center text-sm text-[#6f6b5f]">No projects match that search.</p>
                            {/each}
                        </div>
                    </aside>
                </div>
            {:else}
                <section class="mt-6">
                    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h3 class="text-sm font-medium text-[#eae9e4]">Activity</h3>
                            <p class="mt-0.5 text-xs text-[#6f6b5f]">
                                {activityScope === "projects" ? "Work from your projects." : "Releases from projects you follow."}
                            </p>
                        </div>
                        <div class="flex flex-wrap justify-end gap-2">
                            <div class="flex rounded bg-[#141412] p-1">
                                <button
                                    class="rounded px-2.5 py-1 text-xs font-medium {activityScope === 'projects'
                                        ? 'bg-[#eae9e4] text-[#0f0f0d]'
                                        : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                                    onclick={() => (activityScope = "projects")}
                                >
                                    Your projects
                                </button>
                                <button
                                    class="rounded px-2.5 py-1 text-xs font-medium {activityScope === 'following'
                                        ? 'bg-[#eae9e4] text-[#0f0f0d]'
                                        : 'text-[#8c887e] hover:text-[#eae9e4]'}"
                                    onclick={() => (activityScope = "following")}
                                >
                                    Following
                                </button>
                            </div>
                            <div class="flex w-full gap-2 sm:w-96">
                            <input
                                class="h-9 min-w-0 flex-1 rounded border border-[#2a2a28] bg-[#141412] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#3a3a36]"
                                placeholder="Search public projects"
                                bind:value={publicSearch}
                                oninput={publicSearchInput}
                                onkeydown={publicSearchKeydown}
                            />
                            <button
                                class="grid h-9 w-20 place-items-center rounded border border-[#2a2a28] text-sm font-medium text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]"
                                disabled={searchBusy}
                                onclick={runSearch}
                            >
                                {#if searchBusy}
                                    <Loader2 class="h-4 w-4 animate-spin" />
                                {:else}
                                    Search
                                {/if}
                            </button>
                            </div>
                        </div>
                    </div>

                    <div class="overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
                        {#if publicResults}
                            {#each publicResults as project}
                                <button
                                    class="block w-full border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
                                    onclick={() => goto(projectPath(project))}
                                >
                                    <div class="truncate text-sm font-medium text-[#f0eee4]">{projectLabel(project)}</div>
                                    <div class="mt-1 flex gap-2 text-xs text-[#6f6b5f]">
                                        <span>{project.stats.open_issue_count} issues</span>
                                        <span>{project.stats.release_count} releases</span>
                                    </div>
                                </button>
                            {:else}
                                <p class="px-4 py-8 text-center text-sm text-[#6f6b5f]">No public projects found.</p>
                            {/each}
                        {:else}
                            {#each currentActivity as item}
                                <a class="block border-b border-[#252522] px-4 py-3 last:border-b-0 hover:bg-[#1a1a18]" href={item.href}>
                                    <div class="truncate text-sm font-medium text-[#f0eee4]">{item.title}</div>
                                    <div class="mt-1 truncate text-xs text-[#6f6b5f]">
                                        {activityDetail(item)} / {timestamp(item.timestamp)}
                                    </div>
                                    {#if item.detail}
                                        <div class="mt-1 truncate text-xs text-[#8c887e]">{withoutOpaqueUserIds(item.detail)}</div>
                                    {/if}
                                </a>
                            {:else}
                                <p class="px-4 py-8 text-center text-sm text-[#6f6b5f]">
                                    {activityScope === "projects"
                                        ? "No recent activity in your projects."
                                        : "Follow public projects to see releases here."}
                                </p>
                            {/each}
                        {/if}
                    </div>
                </section>
            {/if}
        {/if}
    </div>
</div>
