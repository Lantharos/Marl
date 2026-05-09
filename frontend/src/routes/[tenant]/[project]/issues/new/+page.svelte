<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { createIssue, getMe, isAbortError, listIssuesPage, type Issue, type IssueType, type UserProfile } from '$lib/api';
	import ContentComposer from '$lib/components/ContentComposer.svelte';
	import IssueMetadataSidebar from '$lib/components/IssueMetadataSidebar.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import Circle from 'lucide-svelte/icons/circle';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let title = $state('');
	let body = $state('');
	let labels = $state<string[]>([]);
	let assignees = $state<string[]>([]);
	let milestone = $state<string | null>(null);
	let issueType = $state<IssueType | null>(null);
	let issues = $state<Issue[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let error = $state('');
	let createMore = $state(false);
	let canWrite = $state(false);
	let canMaintain = $state(false);
	let currentUser = $state('');
	let currentUserProfile = $state<UserProfile | null>(null);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	const duplicateCandidates = $derived(() => {
		const words = importantWords(`${title} ${body}`);
		if (!title.trim() || words.length < 2) return [];
		return issues
			.map((issue) => ({ issue, score: issueScore(issue, words) }))
			.filter((item) => item.score > 1)
			.sort((a, b) => b.score - a.score)
			.slice(0, 4)
			.map((item) => item.issue);
	});

	onMount(() => {
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [issuePage, me] = await Promise.all([
				listIssuesPage(tenant, project, { page: 1, perPage: 500, state: 'all', signal }),
				getMe({ signal }).catch(() => null)
			]);
			issues = issuePage.items;
			currentUser = me?.user ?? '';
			currentUserProfile = me?.profile ?? null;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load issues';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	function importantWords(value: string) {
		const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'into', 'when', 'where', 'issue', 'bug']);
		return value
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, ' ')
			.split(/\s+/)
			.filter((word) => word.length > 3 && !stop.has(word))
			.slice(0, 20);
	}

	function issueScore(issue: Issue, words: string[]) {
		const titleText = issue.title.toLowerCase();
		const bodyText = issue.body.toLowerCase();
		return words.reduce((score, word) => score + (titleText.includes(word) ? 2 : 0) + (bodyText.includes(word) ? 1 : 0), 0);
	}

	async function submit() {
		if (!canWrite || !title.trim() || busy) return;
		busy = true;
		error = '';
		try {
			const issue = await createIssue(tenant, project, {
				title: title.trim(),
				body: body.trim(),
				labels,
				assignees,
				milestone,
				issue_type: issueType
			});
			if (createMore) {
				title = '';
				body = '';
				labels = [];
				assignees = [];
				milestone = null;
				issueType = null;
				issues = [issue, ...issues];
			} else {
				await goto(`/${tenant}/${project}/issues/${issue.number}`);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create issue';
		} finally {
			busy = false;
		}
	}

	function updateMetadata(patch: { labels?: string[]; assignees?: string[]; milestone?: string | null; issue_type?: IssueType | null; workspace?: string | null; close_issue?: boolean; locked?: boolean; pinned?: boolean }) {
		if (patch.labels) labels = patch.labels;
		if (patch.assignees) assignees = patch.assignees;
		if ('milestone' in patch) milestone = patch.milestone ?? null;
		if ('issue_type' in patch) issueType = patch.issue_type ?? null;
	}
</script>

<div class="mx-auto max-w-6xl">
	{#if loading}
		<Spinner />
	{:else}
		<div class="mb-5">
			<h1 class="text-xl font-semibold text-[#f0eee4]">Create new issue</h1>
			<p class="mt-1 text-sm text-[#8c887e]">Start with a clear title. sty will surface possible duplicates before you submit.</p>
		</div>

		{#if error}
			<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
		{/if}

		<div class="grid gap-8 lg:grid-cols-[1fr_280px]">
			<section class="grid grid-cols-[28px_1fr] gap-3">
				<UserAvatar user={currentUser} profile={currentUserProfile} className="mt-1" />
				<div class="min-w-0">
					<div class="mb-4 border border-[#2a2a28] bg-[#0f0f0d]">
						<div class="border-b border-[#252522] bg-[#141412] px-4 py-3">
							<label class="mb-2 block text-sm font-medium text-[#eae9e4]" for="issue-title">Add a title <span class="text-[#d96c5a]">*</span></label>
							<input id="issue-title" class="issue-title-input w-full border border-transparent bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Title" bind:value={title} />
						</div>
						<div class="px-4 py-4">
							<div class="mb-2 text-sm font-medium text-[#eae9e4]">Add a description</div>
							<ContentComposer value={body} placeholder="Type your description here..." minHeight="360px" onInput={(value) => (body = value)} />
						</div>
					</div>

					{#if duplicateCandidates().length}
						<div class="mb-4 border border-[#2a2a28] bg-[#141412] p-4">
							<div class="mb-3 flex items-center gap-2 text-sm font-medium text-[#eae9e4]"><Search class="h-4 w-4 text-[#d9a66c]" /> Possible duplicates</div>
							<div class="grid gap-2">
								{#each duplicateCandidates() as issue}
									<a class="flex items-start gap-2 text-sm text-[#a09d94] hover:text-[#d9a66c]" href="/{tenant}/{project}/issues/{issue.number}">
										<Circle class="mt-1 h-3.5 w-3.5 shrink-0 text-[#7cb97c]" />
										<span class="min-w-0"><span class="text-[#eae9e4]">#{issue.number}</span> {issue.title}</span>
									</a>
								{/each}
							</div>
						</div>
					{/if}

					<div class="flex flex-wrap items-center justify-end gap-3">
						<button class="flex items-center gap-2 text-sm text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (createMore = !createMore)}>
							<span class="flex h-4 w-4 items-center justify-center border border-[#3a3a36] bg-[#0f0f0d] text-[10px] text-[#d9a66c]">{createMore ? '✓' : ''}</span>
							Create more
						</button>
						<a class="px-3 py-1.5 text-sm text-[#a09d94] hover:text-[#eae9e4]" href="/{tenant}/{project}/issues">Cancel</a>
						<button class="inline-flex items-center gap-2 bg-[#eae9e4] px-3 py-1.5 text-sm font-medium text-[#0f0f0d] hover:bg-[#d8d3c5] disabled:opacity-50" disabled={!canWrite || !title.trim() || busy} onclick={submit}>
							<Plus class="h-4 w-4" /> {busy ? 'Creating...' : 'Create'}
						</button>
					</div>
				</div>
			</section>

			<IssueMetadataSidebar {tenant} {project} {labels} {assignees} {milestone} issueType={issueType} {canWrite} {canMaintain} mode="new" onChange={updateMetadata} />
		</div>
	{/if}
</div>

<style>
	.issue-title-input:focus,
	.issue-title-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
