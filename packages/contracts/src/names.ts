export const slugPattern = '[a-z0-9](?:(?:[a-z0-9._]|-){0,98}[a-z0-9])?';

const slug = new RegExp(`^${slugPattern}$`);
const reservedIdentitySlugs = new Set([
  'about',
  'abuse',
  'admin',
  'api',
  'assets',
  'docs',
  'forgot-password',
  'ghost',
  'health',
  'help',
  'import',
  'inbox',
  'invitations',
  'issues',
  'legal',
  'marl-social.png',
  'new',
  'next',
  'notifications',
  'offline',
  'organizations',
  'pulls',
  'repositories',
  'reset-password',
  'robots.txt',
  'runners',
  'runs',
  'security',
  'service-worker.js',
  'settings',
  'sign-in',
  'sign-up',
  'sitemap.xml',
  'status',
  'two-factor'
]);

export function validSlug(value: unknown): value is string {
  return typeof value === 'string' && slug.test(value);
}

export function validIdentitySlug(value: unknown): value is string {
  return validSlug(value) && !reservedIdentitySlugs.has(value.toLowerCase());
}
