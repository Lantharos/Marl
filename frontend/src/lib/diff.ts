import { processFile } from '@pierre/diffs';
import { createTwoFilesPatch } from 'diff';

export function renderFileDiff(
	path: string,
	oldText: string | null,
	newText: string | null,
	cacheKey: string
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
		cacheKey,
		oldFile: { name: path, contents: oldContents },
		newFile: { name: path, contents: newContents }
	});
}
