import type { ShjLanguage, ShjToken } from '@speed-highlight/core';

const keywordPattern =
	/\b(async|await|break|case|catch|class|const|continue|derive|else|enum|export|fn|for|from|function|if|impl|import|in|interface|let|match|mod|pub|return|self|struct|type|use|where|while)\b/g;
const numberPattern = /\b\d+(\.\d+)?\b/g;
const literalPattern = /(\/\/.*|#\[.*\]|"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g;

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
	let html = '';
	let cursor = 0;
	for (const match of value.matchAll(literalPattern)) {
		const index = match.index ?? 0;
		html += highlightPlain(value.slice(cursor, index));
		const literal = match[0];
		const color = literal.startsWith('//') || literal.startsWith('#[') ? '#6f6b5f' : '#d9a66c';
		html += `<span style="color: ${color}">${escapeHtml(literal)}</span>`;
		cursor = index + literal.length;
	}
	html += highlightPlain(value.slice(cursor));
	return html;
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

function highlightPlain(value: string) {
	return escapeHtml(value)
		.replace(keywordPattern, '<span style="color: #7fb4d9">$1</span>')
		.replace(numberPattern, '<span style="color: #9fca7c">$&</span>');
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
