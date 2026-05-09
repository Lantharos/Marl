import type { ShjLanguage, ShjToken } from '@speed-highlight/core';

const keywordPattern =
	/\b(async|await|break|case|catch|class|const|continue|derive|else|enum|export|fn|for|from|function|if|impl|import|in|interface|let|match|mod|pub|return|self|struct|type|use|where|while)\b/g;
const numberPattern = /\b\d+(\.\d+)?\b/g;
const plainTokenPattern =
	/\b(async|await|break|case|catch|class|const|continue|derive|else|enum|export|fn|for|from|function|if|impl|import|in|interface|let|match|mod|pub|return|self|struct|type|use|where|while)\b|\b\d+(\.\d+)?\b/g;
const literalPattern = /(\/\/.*|#\[.*\]|"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g;

export interface HighlightSegment {
	text: string;
	color?: string;
}

const extensionLanguages: Record<string, ShjLanguage> = {
	asm: 'asm',
	bash: 'bash',
	c: 'c',
	css: 'css',
	csv: 'csv',
	diff: 'diff',
	dockerfile: 'docker',
	go: 'go',
	html: 'html',
	http: 'http',
	ini: 'ini',
	java: 'java',
	js: 'js',
	json: 'json',
	jsonc: 'json',
	lua: 'lua',
	makefile: 'make',
	md: 'md',
	pl: 'pl',
	ps1: 'bash',
	py: 'py',
	rs: 'rs',
	sql: 'sql',
	svelte: 'html',
	toml: 'toml',
	ts: 'ts',
	tsx: 'ts',
	xml: 'xml',
	yaml: 'yaml',
	yml: 'yaml'
};

export async function highlightCodeLines(value: string, path: string) {
	const language = languageForPath(path);
	const lines = [''];
	try {
		const { tokenize } = await import('@speed-highlight/core');
		await tokenize(value, language, (text, token) => appendToken(lines, text, token));
	} catch {
		return value.split('\n').map(escapeHtml);
	}
	return lines;
}

export function highlightCode(value: string) {
	return highlightCodeSegments(value)
		.map((segment) => (segment.color ? `<span style="color: ${segment.color}">${escapeHtml(segment.text)}</span>` : escapeHtml(segment.text)))
		.join('');
}

export function highlightCodeSegments(value: string): HighlightSegment[] {
	const segments: HighlightSegment[] = [];
	let cursor = 0;
	for (const match of value.matchAll(literalPattern)) {
		const index = match.index ?? 0;
		segments.push(...highlightPlainSegments(value.slice(cursor, index)));
		const literal = match[0];
		const color = literal.startsWith('//') || literal.startsWith('#[') ? '#6f6b5f' : '#d9a66c';
		segments.push({ text: literal, color });
		cursor = index + literal.length;
	}
	segments.push(...highlightPlainSegments(value.slice(cursor)));
	return segments;
}

export function languageForPath(path: string): ShjLanguage {
	const name = path.split('/').pop()?.toLowerCase() ?? '';
	if (name === 'dockerfile') return 'docker';
	if (name === 'makefile') return 'make';
	const extension = name.includes('.') ? name.split('.').pop() ?? '' : name;
	return extensionLanguages[extension] ?? 'plain';
}

export function languageLabelForPath(path: string) {
	const name = path.split('/').pop()?.toLowerCase() ?? '';
	if (name === 'dockerfile') return 'docker';
	if (name === 'makefile') return 'make';
	return name.includes('.') ? name.split('.').pop() || 'plain' : name || 'plain';
}

function appendToken(lines: string[], text: string, token?: ShjToken) {
	const fragments = text.split('\n');
	for (let index = 0; index < fragments.length; index += 1) {
		if (index > 0) lines.push('');
		lines[lines.length - 1] += wrapToken(fragments[index], token);
	}
}

function wrapToken(value: string, token?: ShjToken) {
	const escaped = escapeHtml(value);
	return token ? `<span class="shj-syn-${token}">${escaped}</span>` : escaped;
}

function highlightPlainSegments(value: string): HighlightSegment[] {
	const segments: HighlightSegment[] = [];
	let cursor = 0;
	for (const match of value.matchAll(plainTokenPattern)) {
		const index = match.index ?? 0;
		if (index > cursor) segments.push({ text: value.slice(cursor, index) });
		const text = match[0];
		segments.push({ text, color: /^\d/.test(text) ? '#9fca7c' : '#7fb4d9' });
		cursor = index + text.length;
	}
	if (cursor < value.length) segments.push({ text: value.slice(cursor) });
	return segments;
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
