import { processFile } from '@pierre/diffs';

export function simplePatch(path: string, oldText: string, newText: string): string {
	const oldLines = oldText === '' ? [] : oldText.split('\n');
	const newLines = newText === '' ? [] : newText.split('\n');

	return [
		`diff --git a/${path} b/${path}`,
		`--- a/${path}`,
		`+++ b/${path}`,
		`@@ -1,${Math.max(oldLines.length, 1)} +1,${Math.max(newLines.length, 1)} @@`,
		...oldLines.map((l) => `-${l}`),
		...newLines.map((l) => `+${l}`)
	].join('\n');
}

export function newFilePatch(path: string, text: string): string {
	const lines = text === '' ? [] : text.split('\n');
	const additions = lines.map((line) => `+${line}`).join('\n');
	return [
		`diff --git a/${path} b/${path}`,
		'new file mode 100644',
		'--- /dev/null',
		`+++ b/${path}`,
		`@@ -0,0 +1,${Math.max(lines.length, 1)} @@`,
		additions
	].join('\n');
}

export function deletedFilePatch(path: string, text: string): string {
	const lines = text === '' ? [] : text.split('\n');
	const deletions = lines.map((line) => `-${line}`).join('\n');
	return [
		`diff --git a/${path} b/${path}`,
		'deleted file mode 100644',
		`--- a/${path}`,
		'+++ /dev/null',
		`@@ -1,${Math.max(lines.length, 1)} +0,0 @@`,
		deletions
	].join('\n');
}

export function renderFileDiff(
	path: string,
	oldText: string | null,
	newText: string | null,
	cacheKey: string
) {
	const oldContents = oldText ?? '';
	const newContents = newText ?? '';

	let patch: string;
	if (oldContents === '' && newContents !== '') {
		patch = newFilePatch(path, newContents);
	} else if (oldContents !== '' && newContents === '') {
		patch = deletedFilePatch(path, oldContents);
	} else {
		patch = simplePatch(path, oldContents, newContents);
	}

	return processFile(patch, {
		cacheKey,
		oldFile: { name: path, contents: oldContents },
		newFile: { name: path, contents: newContents }
	});
}
