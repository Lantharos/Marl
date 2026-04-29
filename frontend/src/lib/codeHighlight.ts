const keywordPattern =
	/\b(async|await|break|case|catch|class|const|continue|derive|else|enum|export|fn|for|from|function|if|impl|import|in|interface|let|match|mod|pub|return|self|struct|type|use|where|while)\b/g;
const numberPattern = /\b\d+(\.\d+)?\b/g;
const literalPattern = /(\/\/.*|#\[.*\]|"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g;

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
