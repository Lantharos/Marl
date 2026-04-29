import { diffLines } from 'diff';

export type DiffRow = {
	kind: 'context' | 'add' | 'remove';
	oldLine: number | null;
	newLine: number | null;
	text: string;
};

export type DiffHunk = {
	id: string;
	before: DiffRow[];
	rows: DiffRow[];
	after: DiffRow[];
	hiddenBefore: number;
	hiddenAfter: number;
};

export function renderFileDiff(oldText: string | null, newText: string | null): DiffRow[] {
	const oldContents = oldText ?? '';
	const newContents = newText ?? '';
	if (oldContents === newContents) return [];

	let oldLine = 1;
	let newLine = 1;
	const rows: DiffRow[] = [];

	for (const part of diffLines(oldContents, newContents)) {
		const lines = splitPart(part.value);
		for (const text of lines) {
			if (part.added) {
				rows.push({ kind: 'add', oldLine: null, newLine, text });
				newLine += 1;
			} else if (part.removed) {
				rows.push({ kind: 'remove', oldLine, newLine: null, text });
				oldLine += 1;
			} else {
				rows.push({ kind: 'context', oldLine, newLine, text });
				oldLine += 1;
				newLine += 1;
			}
		}
	}

	return rows;
}

export function renderFileDiffHunks(oldText: string | null, newText: string | null, context = 4): DiffHunk[] {
	const rows = renderFileDiff(oldText, newText);
	const changed = rows
		.map((row, index) => ({ row, index }))
		.filter(({ row }) => row.kind !== 'context')
		.map(({ index }) => index);
	if (changed.length === 0) return [];

	const ranges = changed.map((index) => ({
		start: Math.max(0, index - context),
		end: Math.min(rows.length - 1, index + context)
	}));
	const merged: { start: number; end: number }[] = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end + 1) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push(range);
		}
	}

	return merged.map((range, index) => {
		const hunkRows = rows.slice(range.start, range.end + 1);
		const firstChange = hunkRows.findIndex((row) => row.kind !== 'context');
		const lastChange = hunkRows.findLastIndex((row) => row.kind !== 'context');
		const before = firstChange > 0 ? hunkRows.slice(0, firstChange) : [];
		const after = lastChange >= 0 ? hunkRows.slice(lastChange + 1) : [];
		return {
			id: `${range.start}-${range.end}-${index}`,
			before,
			rows: hunkRows.slice(firstChange, lastChange + 1),
			after,
			hiddenBefore: range.start,
			hiddenAfter: rows.length - range.end - 1
		};
	});
}

function splitPart(value: string) {
	const lines = value.split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines.length ? lines : [''];
}
