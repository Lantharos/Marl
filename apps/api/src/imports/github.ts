export class RateLimited extends Error {
  constructor(public retryAfter: number) {
    super('GitHub rate limit reached.');
  }
}

export class GitHubError extends Error {}

export type GitHubUser = { login: string; id: number; avatar_url: string } | null;

export type GitHubRepository = {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
};

function githubHeaders(token: string | null, accept: string) {
  return {
    accept,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'Marl-Import',
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

function rejectFailure(response: Response) {
  if ((response.status === 403 || response.status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0);
    throw new RateLimited(Math.max(60, reset - Math.floor(Date.now() / 1000) + 5));
  }
  if (response.status === 404)
    throw new GitHubError('The GitHub repository was not found, or the token cannot read it.');
  if (response.status === 401) throw new GitHubError('GitHub rejected the access token.');
  if (!response.ok) throw new GitHubError(`GitHub responded with ${response.status}.`);
}

export function githubClient(token: string | null) {
  return async function request<T>(path: string): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: githubHeaders(token, 'application/vnd.github+json')
    });
    rejectFailure(response);
    return response.json<T>();
  };
}

export async function downloadReleaseAsset(token: string | null, url: string) {
  const redirect = await fetch(url, { headers: githubHeaders(token, 'application/octet-stream'), redirect: 'manual' });
  const location = redirect.headers.get('location');
  if (!location) {
    rejectFailure(redirect);
    return redirect;
  }
  await redirect.body?.cancel();
  const response = await fetch(location, { headers: { 'user-agent': 'Marl-Import' } });
  rejectFailure(response);
  return response;
}

export function parseGitHubSource(value: string) {
  const match = value
    .trim()
    .replace(/\.git$/, '')
    .match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

export function rewriteReferences(body: string | null, pullNumbers: Set<number>) {
  return (body ?? '')
    .replace(/(^|[^\w`/@])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\b/g, '$1[@$2](https://github.com/$2)')
    .replace(/(^|[^\w&/])#(\d+)\b/g, (match, prefix: string, number: string) =>
      pullNumbers.has(Number(number)) ? `${prefix}!${number}` : match
    );
}
