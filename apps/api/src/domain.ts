const slugPattern = /^[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?$/;
const reservedIdentitySlugs = new Set(['api', 'assets', 'forgot-password', 'health', 'inbox', 'invitations', 'issues', 'marl-social.png', 'new', 'organizations', 'pulls', 'repositories', 'reset-password', 'robots.txt', 'runners', 'runs', 'settings', 'sign-in', 'sign-up', 'sitemap.xml', 'two-factor']);

export function validSlug(value: unknown): value is string {
  return typeof value === 'string' && slugPattern.test(value);
}

export function validIdentitySlug(value: unknown): value is string {
  return validSlug(value) && !reservedIdentitySlugs.has(value.toLowerCase());
}

export function validVisibility(value: unknown): value is 'private' | 'public' {
  return value === 'private' || value === 'public';
}

export function identifier(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function safeRepositoryPath(value: string): boolean {
  if (!value || value.startsWith('/') || value.startsWith('\\') || /^[a-z]:/i.test(value)) return false;
  return !value
    .replaceAll('\\', '/')
    .split('/')
    .some((part) => part === '..' || part === '');
}

export function validBranchName(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 255 || value === '@' || value.startsWith('/') || value.endsWith('/') || value.endsWith('.') || value.includes('..') || value.includes('@{') || value.includes('//')) return false;
  return !/[\u0000-\u0020\u007f~^:?*\[\\]/.test(value) && value.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

export function validTagName(value: unknown): value is string {
  return typeof value === 'string' && !value.startsWith('-') && validBranchName(value) && value !== 'HEAD';
}
