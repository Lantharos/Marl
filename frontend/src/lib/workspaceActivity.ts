import type { WorkspaceStatus } from '$lib/api';

type WorkspaceMetadata = Pick<WorkspaceStatus, 'reviewers' | 'assignees' | 'milestone' | 'linked_issues' | 'locked'>;

export function labelActivity(previous: string[], next: string[]) {
	const added = next.filter((label) => !previous.includes(label)).map((label) => `added the label ${label}`);
	const removed = previous.filter((label) => !next.includes(label)).map((label) => `removed the label ${label}`);
	return [...added, ...removed];
}

export function metadataActivity(
	previous: WorkspaceMetadata,
	next: WorkspaceMetadata,
	metadata: Partial<WorkspaceMetadata>
) {
	const messages: string[] = [];
	if (metadata.reviewers) messages.push(...listActivity(previous.reviewers ?? [], next.reviewers ?? [], 'requested review from', 'removed review request from'));
	if (metadata.assignees) messages.push(...listActivity(previous.assignees ?? [], next.assignees ?? [], 'assigned', 'unassigned'));
	if ('milestone' in metadata && previous.milestone !== next.milestone) messages.push(next.milestone ? `set the milestone to ${next.milestone}` : 'cleared the milestone');
	if (metadata.linked_issues) messages.push(...listActivity(previous.linked_issues ?? [], next.linked_issues ?? [], 'linked issue', 'unlinked issue'));
	if ('locked' in metadata && previous.locked !== next.locked) messages.push(next.locked ? 'locked the conversation' : 'unlocked the conversation');
	return messages;
}

function listActivity(previous: string[], next: string[], addedLabel: string, removedLabel: string) {
	return [
		...next.filter((item) => !previous.includes(item)).map((item) => `${addedLabel} ${item}`),
		...previous.filter((item) => !next.includes(item)).map((item) => `${removedLabel} ${item}`)
	];
}
