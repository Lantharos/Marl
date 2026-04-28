import { diffLines } from 'diff';

export type DiffRow = {
	kind: 'context' | 'add' | 'remove';
	oldLine: number | null;
	newLine: number | null;
	text: string;
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

function splitPart(value: string) {
	const lines = value.split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines.length ? lines : [''];
}
