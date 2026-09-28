export type CodeQuery = {
  pattern: string;
  regex: boolean;
  caseSensitive: boolean;
  paths: string[];
  extensions: string[];
};

const languageExtensions: Record<string, string[]> = {
  c: ['c', 'h'],
  cpp: ['cc', 'cpp', 'cxx', 'hh', 'hpp', 'hxx'],
  csharp: ['cs'],
  css: ['css', 'scss', 'sass', 'less'],
  go: ['go'],
  html: ['html', 'htm'],
  java: ['java'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  json: ['json', 'jsonc'],
  kotlin: ['kt', 'kts'],
  markdown: ['md', 'mdx'],
  php: ['php'],
  python: ['py', 'pyi'],
  ruby: ['rb'],
  rust: ['rs'],
  shell: ['sh', 'bash', 'zsh', 'fish'],
  sql: ['sql'],
  svelte: ['svelte'],
  swift: ['swift'],
  toml: ['toml'],
  typescript: ['ts', 'tsx', 'mts', 'cts'],
  vue: ['vue'],
  yaml: ['yml', 'yaml'],
  zig: ['zig']
};
const languageAliases: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rs: 'rust',
  sh: 'shell'
};

function tokens(input: string) {
  return [...input.matchAll(/(\S+:"[^"]*"|"[^"]*"|\S+)/g)].map((match) => match[0]);
}

function unquote(value: string) {
  return value.length > 1 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

export function parseCodeQuery(input: string, options: { regex: boolean; caseSensitive: boolean }): CodeQuery {
  const terms: string[] = [];
  const query: CodeQuery = { pattern: '', paths: [], extensions: [], ...options };
  for (const token of tokens(input.trim())) {
    const qualifier = token.match(/^(path|lang|language|ext):(.+)$/i);
    if (!qualifier) {
      terms.push(token);
      continue;
    }
    const value = unquote(qualifier[2]).toLowerCase();
    if (qualifier[1].toLowerCase() === 'path') query.paths.push(value);
    else if (qualifier[1].toLowerCase() === 'ext') query.extensions.push(value.replace(/^\./, ''));
    else query.extensions.push(...(languageExtensions[languageAliases[value] ?? value] ?? [value]));
  }
  const pattern = terms.join(' ');
  const slashed = pattern.match(/^\/(.+)\/$/);
  if (slashed) return { ...query, pattern: slashed[1], regex: true };
  return { ...query, pattern: query.regex ? pattern : unquote(pattern) };
}
