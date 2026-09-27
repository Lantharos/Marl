import markedFootnote from 'marked-footnote';

export function footnotes() {
  const extension = markedFootnote();
  for (const item of extension.extensions ?? []) {
    if (!('tokenizer' in item) || !item.tokenizer || !['footnote', 'footnoteRef'].includes(item.name)) continue;
    const tokenize = item.tokenizer;
    item.tokenizer = function (source, tokens) {
      const normalized = source.replace(/^\[\^([^\]\n]+)\]/, (_, label: string) => `[^${label.toLowerCase()}]`);
      const result = tokenize.call(this, normalized, tokens);
      if (result) result.raw = source.slice(0, result.raw.length + source.length - normalized.length);
      return result;
    };
  }
  return extension;
}
