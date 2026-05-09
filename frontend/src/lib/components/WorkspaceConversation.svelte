<script lang="ts">
	import type { HistoryEntry, ReviewComment, WorkspaceStatus } from '$lib/api';
	import { userDisplayName, userInitials, withoutOpaqueUserIds } from '$lib/identity';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import CircleDot from 'lucide-svelte/icons/circle-dot';
	import GitMerge from 'lucide-svelte/icons/git-merge';
	import type { ComposerAction } from './ContentComposer.svelte';
	import ReviewThread from './ReviewThread.svelte';
	import WorkspaceReviewSidebar from './WorkspaceReviewSidebar.svelte';

	type WorkspaceDetail = WorkspaceStatus & { history?: HistoryEntry[] };
	type SubmitAction = ComposerAction;
	type FileReviewEvent = {
		key: string;
		author: string;
		profile: ReviewComment['author_profile'];
		comments: ReviewComment[];
		files: string[];
		openCount: number;
		createdAt: string;
		lastAt: number;
	};
	type ActivityItem =
		| { type: 'comment'; key: string; at: number; comment: ReviewComment }
		| { type: 'activity'; key: string; at: number; comment: ReviewComment }
		| { type: 'file_review'; key: string; at: number; event: FileReviewEvent }
		| { type: 'history'; key: string; at: number; entry: HistoryEntry }
		| { type: 'history_group'; key: string; at: number; entries: HistoryEntry[] };

	let {
		detail,
		tenant,
		project,
		workspaceName,
		workspaceComments,
		activityComments,
		fileThreads,
		unresolvedFileThreads,
		conversationActions,
		currentUser,
		currentUserProfile = null,
		canWrite,
		canMaintain,
		busy,
		onSubmitComment,
		onSubmitAction,
		onUpdateComment,
		onDeleteComment,
		onOpenFileConversation,
		onOpenHistory,
		onSaveMetadata,
		onSaveLabels
	}: {
		detail: WorkspaceDetail;
		tenant: string;
		project: string;
		workspaceName: string;
		workspaceComments: ReviewComment[];
		activityComments: ReviewComment[];
		fileThreads: ReviewComment[];
		unresolvedFileThreads: ReviewComment[];
		conversationActions: SubmitAction[];
		currentUser: string | null;
		currentUserProfile?: ReviewComment['author_profile'] | null;
		canWrite: boolean;
		canMaintain: boolean;
		busy: boolean;
		onSubmitComment: (body: string) => Promise<void> | void;
		onSubmitAction: (body: string, action: string) => Promise<void> | void;
		onUpdateComment: (comment: ReviewComment, body: string) => Promise<void> | void;
		onDeleteComment: (comment: ReviewComment) => Promise<void> | void;
		onOpenFileConversation: (comment: ReviewComment) => void;
		onOpenHistory: () => void;
		onSaveMetadata: (metadata: Partial<Pick<WorkspaceStatus, 'reviewers' | 'assignees' | 'milestone' | 'linked_issues' | 'locked'>>) => Promise<void> | void;
		onSaveLabels: (labels: string[]) => Promise<void> | void;
	} = $props();

	const fileReviewEvents = $derived(groupFileEvents(fileThreads));
	const reviewers = $derived(buildReviewers([...workspaceComments, ...fileThreads]));
	const authorEntry = $derived([...(detail.history ?? [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0] ?? null);
	const participants = $derived(buildParticipants([...workspaceComments, ...activityComments, ...fileThreads], authorEntry));
	const historyEvents = $derived([...(detail.history ?? [])].sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp)));
	const activityItems = $derived(buildActivityTimeline(workspaceComments, activityComments, fileReviewEvents, historyEvents));

	function statusLabel() {
		if (detail.status === 'merged') return 'Merged';
		if (detail.status === 'closed') return 'Closed';
		if (detail.status === 'not_planned') return 'Not planned';
		if (detail.status === 'changes_requested') return 'Changes requested';
		if (unresolvedFileThreads.length) return 'Changes requested';
		if (detail.is_ready) return detail.mergeable ? 'Ready to merge' : 'Ready, blocked';
		return 'Draft';
	}

	function statusDetail() {
		if (detail.status === 'merged') return 'This workspace has been merged.';
		if (detail.status === 'closed') return 'This workspace was closed without merging.';
		if (detail.status === 'not_planned') return 'This workspace was closed as not planned.';
		if (detail.status === 'changes_requested') return 'Address the feedback, then mark it ready again from the action menu.';
		if (detail.locked) return 'This conversation is locked to maintainers.';
		if (unresolvedFileThreads.length) return `${unresolvedFileThreads.length} file ${unresolvedFileThreads.length === 1 ? 'conversation needs' : 'conversations need'} resolution.`;
		if (detail.is_ready && detail.mergeable) return 'No blocking file conversations are open.';
		if (detail.is_ready) return 'The workspace is ready, but the merge is blocked.';
		return 'Add a summary, then mark it ready from the action menu.';
	}

	function groupFileEvents(comments: ReviewComment[]) {
		const sorted = [...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
		const groups: FileReviewEvent[] = [];
		for (const comment of sorted) {
			const time = new Date(comment.created_at).getTime();
			const last = groups[groups.length - 1];
			if (last && last.author === comment.author && time - last.lastAt < 10 * 60 * 1000) {
				last.comments.push(comment);
				last.files = [...new Set([...last.files, comment.file ?? ''])].filter(Boolean);
				last.openCount += comment.state === 'resolved' ? 0 : 1;
				last.lastAt = time;
				last.key = last.comments.map((item) => item.id).join(':');
			} else {
				groups.push({
					key: comment.id,
					author: comment.author,
					profile: comment.author_profile,
					comments: [comment],
					files: comment.file ? [comment.file] : [],
					openCount: comment.state === 'resolved' ? 0 : 1,
					createdAt: comment.created_at,
					lastAt: time
				});
			}
		}
		return groups;
	}

	function buildActivityTimeline(comments: ReviewComment[], activity: ReviewComment[], fileEvents: FileReviewEvent[], historyEvents: HistoryEntry[]): ActivityItem[] {
		const raw = [
			...comments.map((comment) => ({
				type: 'comment' as const,
				key: `comment:${comment.id}`,
				at: timestampValue(comment.created_at),
				comment
			})),
			...activity.map((comment) => ({
				type: 'activity' as const,
				key: `activity:${comment.id}`,
				at: timestampValue(comment.created_at),
				comment
			})),
			...fileEvents.map((event) => ({
				type: 'file_review' as const,
				key: `file-review:${event.key}`,
				at: event.lastAt,
				event
			})),
			...historyEvents.map((entry) => ({
				type: 'history' as const,
				key: `history:${entry.id}`,
				at: timestampValue(entry.timestamp),
				entry
			}))
		].sort((a, b) => a.at - b.at);
		const timeline: ActivityItem[] = [];
		let pendingHistory: HistoryEntry[] = [];

		function flushHistory() {
			if (!pendingHistory.length) return;
			if (pendingHistory.length === 1) {
				const entry = pendingHistory[0];
				timeline.push({ type: 'history', key: `history:${entry.id}`, at: timestampValue(entry.timestamp), entry });
			} else {
				const first = pendingHistory[0];
				const last = pendingHistory[pendingHistory.length - 1];
				timeline.push({
					type: 'history_group',
					key: `history-group:${first.id}:${last.id}:${pendingHistory.length}`,
					at: timestampValue(last.timestamp),
					entries: [...pendingHistory]
				});
			}
			pendingHistory = [];
		}

		for (const item of raw) {
			if (item.type === 'history' && !isReviewHistoryEvent(item.entry)) {
				pendingHistory.push(item.entry);
			} else {
				flushHistory();
				timeline.push(item);
			}
		}
		flushHistory();
		return timeline;
	}

	function buildReviewers(comments: ReviewComment[]) {
		return [...new Map(comments.map((comment) => [comment.author, comment])).values()].map((comment) => {
			const authoredFileThreads = fileThreads.filter((thread) => thread.author === comment.author);
			const open = authoredFileThreads.filter((thread) => thread.state !== 'resolved').length;
			return {
				author: comment.author,
				profile: comment.author_profile,
				state: open ? `${open} open` : authoredFileThreads.length ? 'reviewed' : 'commented',
				stateClass: open ? 'text-[#d9a66c]' : authoredFileThreads.length ? 'text-[#7cb97c]' : 'text-[#6f6b5f]'
			};
		});
	}

	function buildParticipants(comments: ReviewComment[], author: HistoryEntry | null) {
		const people = new Map<string, { user: string; profile?: ReviewComment['author_profile'] | null }>();
		if (author) people.set(author.author, { user: author.author, profile: author.author_profile });
		for (const comment of comments) {
			people.set(comment.author, { user: comment.author, profile: comment.author_profile });
		}
		return [...people.values()];
	}

	function eventTarget(event: FileReviewEvent) {
		return event.comments.find((comment) => comment.state !== 'resolved') ?? event.comments[0];
	}

	function lineLabel(comment: ReviewComment) {
		const line = comment.start_line ?? comment.line;
		return line ? `line ${line}` : 'file';
	}

	function timestampValue(value: string) {
		const time = new Date(value).getTime();
		return Number.isFinite(time) ? time : 0;
	}

	function isReviewHistoryEvent(entry: HistoryEntry) {
		if (['ready', 'merge', 'closed', 'not_planned', 'changes_requested'].includes(entry.kind)) return true;
		return /marked workspace|rejected workspace|closed workspace|not_planned workspace|merged workspace/.test(entry.message);
	}

	function reviewEventLabel(entry: HistoryEntry) {
		const message = entry.message.toLowerCase();
		if (entry.kind === 'merge' || message.includes('merged workspace')) return 'merged';
		if (entry.kind === 'closed' || message.includes('closed workspace')) return 'closed';
		if (entry.kind === 'not_planned' || message.includes('not_planned workspace')) return 'closed as not planned';
		if (message.includes('rejected workspace')) return 'requested changes';
		if (message.includes('marked workspace')) return 'marked ready';
		return withoutOpaqueUserIds(entry.message);
	}

	function historyEventLabel(entry: HistoryEntry) {
		if (isReviewHistoryEvent(entry)) return reviewEventLabel(entry);
		if (entry.kind === 'cram') return 'crammed changes';
		if (entry.kind === 'ship') return 'shipped changes';
		if (entry.kind === 'save') return 'saved changes';
		return withoutOpaqueUserIds(entry.message);
	}

	function historyGroupLabel(entries: HistoryEntry[]) {
		const saves = entries.filter((entry) => entry.kind === 'save').length;
		if (saves === entries.length) return `${entries.length} ${entries.length === 1 ? 'save' : 'saves'}`;
		return `${entries.length} history updates`;
	}

	function historyGroupAuthor(entries: HistoryEntry[]) {
		const authors = [...new Set(entries.map((entry) => entry.author))];
		if (authors.length === 1) return userDisplayName(entries[0].author, entries[0].author_profile);
		return `${authors.length} authors`;
	}
</script>

<div class="grid items-start gap-5 lg:grid-cols-[1fr_280px]">
	<section class="grid self-start">
		<div class="relative grid self-start gap-5 before:absolute before:left-[13px] before:top-0 before:bottom-0 before:w-px before:bg-[#252522]">
			<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3 py-1">
				<div class="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f0f0d]">
					{#if detail.status === 'merged'}
						<GitMerge class="h-4 w-4 text-[#8c887e]" />
					{:else if detail.status === 'changes_requested' || unresolvedFileThreads.length}
						<CircleDot class="h-4 w-4 text-[#d9a66c]" />
					{:else}
						<CheckCircle2 class="h-4 w-4 text-[#7cb97c]" />
					{/if}
				</div>
				<div class="min-w-0 py-0.5 text-sm">
					<div class="font-medium text-[#eae9e4]">{statusLabel()}</div>
					<div class="mt-0.5 text-xs text-[#6f6b5f]">{statusDetail()}</div>
				</div>
			</div>

			{#each activityItems as item (item.key)}
				{#if item.type === 'comment'}
					<ReviewThread
						title=""
						comments={[item.comment]}
						onSubmit={onSubmitComment}
						onUpdate={onUpdateComment}
						onDelete={onDeleteComment}
						readonly={true}
						showEmpty={false}
						commentVariant="timeline"
						{currentUser}
						{canMaintain}
					/>
				{:else if item.type === 'activity'}
					{@const comment = item.comment}
					<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3 py-2">
						<div class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
							{#if comment.author_profile?.avatar_url}
								<img src={comment.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />
							{:else}
								{userInitials(comment.author, comment.author_profile)}
							{/if}
						</div>
						<div class="min-w-0 py-0.5">
							<div class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
								<span class="font-medium text-[#eae9e4]">{userDisplayName(comment.author, comment.author_profile)}</span>
								<span class="text-[#8c887e]">{comment.body}</span>
								<span class="text-[#6f6b5f]">{new Date(comment.created_at).toLocaleString()}</span>
							</div>
						</div>
					</div>
				{:else if item.type === 'file_review'}
					{@const event = item.event}
					{@const target = eventTarget(event)}
					<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3 py-2">
						<div class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
							{#if event.profile?.avatar_url}
								<img src={event.profile.avatar_url} alt="" class="h-full w-full object-cover" />
							{:else}
								{userInitials(event.author, event.profile)}
							{/if}
						</div>
						<button class="group min-w-0 py-0.5 text-left" onclick={() => onOpenFileConversation(target)}>
							<div class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
								<span class="font-medium text-[#eae9e4]">{userDisplayName(event.author, event.profile)}</span>
								<span class="text-[#8c887e]">commented on file changes</span>
								<span class={event.openCount ? 'text-[#d9a66c]' : 'text-[#7cb97c]'}>{event.openCount ? `${event.openCount} open` : 'resolved'}</span>
								<span class="text-[#6f6b5f]">{new Date(event.lastAt).toLocaleString()}</span>
							</div>
							<div class="mt-1 grid gap-1 text-xs text-[#6f6b5f]">
								{#each event.comments.slice(0, 3) as comment}
									<div class="flex min-w-0 gap-2">
										<span class="min-w-0 truncate text-[#a09d94]">{comment.file}</span>
										<span class="shrink-0">{lineLabel(comment)}</span>
									</div>
								{/each}
								{#if event.comments.length > 3}
									<div>+{event.comments.length - 3} more</div>
								{/if}
							</div>
						</button>
					</div>
				{:else if item.type === 'history'}
					{@const entry = item.entry}
					<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3 py-2">
						<div class="flex h-7 w-7 items-center justify-center rounded-full bg-[#1f1f1c] text-[#8c887e]">
							{#if entry.kind === 'merge'}
								<GitMerge class="h-3.5 w-3.5" />
							{:else if entry.kind === 'changes_requested'}
								<CircleDot class="h-3.5 w-3.5 text-[#d9a66c]" />
							{:else}
								<CheckCircle2 class="h-3.5 w-3.5" />
							{/if}
						</div>
						<div class="min-w-0 py-0.5">
							<div class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
								<span class="font-medium text-[#eae9e4]">{userDisplayName(entry.author, entry.author_profile)}</span>
								<span class="text-[#8c887e]">{historyEventLabel(entry)}</span>
								<span class="text-[#6f6b5f]">{new Date(entry.timestamp).toLocaleString()}</span>
							</div>
							{#if withoutOpaqueUserIds(entry.message) !== historyEventLabel(entry)}
								<div class="mt-0.5 text-xs text-[#6f6b5f]">{withoutOpaqueUserIds(entry.message)}</div>
							{/if}
						</div>
					</div>
				{:else if item.type === 'history_group'}
					<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3 py-2">
						<div class="flex h-7 w-7 items-center justify-center rounded-full bg-[#1f1f1c] text-[#8c887e]">
							<CheckCircle2 class="h-3.5 w-3.5" />
						</div>
						<div class="min-w-0 py-0.5">
							<div class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
								<span class="font-medium text-[#eae9e4]">{historyGroupAuthor(item.entries)}</span>
								<span class="text-[#8c887e]">{historyGroupLabel(item.entries)}</span>
								<span class="text-[#6f6b5f]">{new Date(item.at).toLocaleString()}</span>
								<button class="text-[#d9a66c] hover:text-[#f0d69a]" onclick={onOpenHistory}>History</button>
							</div>
							<div class="mt-0.5 truncate text-xs text-[#6f6b5f]">{withoutOpaqueUserIds(item.entries[item.entries.length - 1]?.message ?? '')}</div>
						</div>
					</div>
				{/if}
			{/each}
		</div>

		<ReviewThread
			title=""
			comments={[]}
			onSubmit={onSubmitComment}
			onSubmitAction={onSubmitAction}
			readonly={(!canWrite && !canMaintain) || (detail.locked && !canMaintain)}
			submitActions={conversationActions}
			showEmpty={false}
			composerVariant="timeline"
			{currentUser}
			{currentUserProfile}
			{canMaintain}
		/>
	</section>

	<WorkspaceReviewSidebar {tenant} {project} {detail} {reviewers} {participants} {authorEntry} {canWrite} {canMaintain} {busy} {onSaveLabels} {onSaveMetadata} />
</div>
