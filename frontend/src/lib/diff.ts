import { processFile } from '@pierre/diffs';
import { createTwoFilesPatch } from 'diff';

export function renderFileDiff(
	path: string,
	oldText: string | null,
	newText: string | null
) {
	const oldContents = oldText ?? '';
	const newContents = newText ?? '';

	if (oldContents === newContents) {
		return null;
	}

	const patch = createTwoFilesPatch(
		`a/${path}`,
		`b/${path}`,
		oldContents,
		newContents,
		undefined,
		undefined,
		{ context: 3 }
	);

	return processFile(patch, {
		cacheKey: diffCacheKey(path, oldContents, newContents),
		oldFile: { name: path, contents: oldContents },
		newFile: { name: path, contents: newContents }
	});
}

function diffCacheKey(path: string, oldContents: string, newContents: string) {
	let hash = 2166136261;
	hash = hashString(hash, path);
	hash = hashString(hash, String(oldContents.length));
	hash = hashString(hash, oldContents);
	hash = hashString(hash, String(newContents.length));
	hash = hashString(hash, newContents);
	return `${path}:${hash >>> 0}`;
}

function hashString(hash: number, value: string) {
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	hash ^= 0;
	return Math.imul(hash, 16777619);
}
