import type { Env } from '../core/platform';
import type { GitHubUser } from './github';

export async function resolveAuthors(
  env: Env,
  users: GitHubUser[],
  importer: { login: string | null; userId: string }
) {
  const known = new Map<string, string>();
  const unique = new Map<number, NonNullable<GitHubUser>>();
  for (const user of users) if (user) unique.set(user.id, user);
  const mannequins = [...unique.values()].filter((user) => user.login !== importer.login);
  if (mannequins.length)
    await env.DB.batch(
      mannequins.map((user) =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO users (id,handle,display_name,avatar_url,kind) VALUES (?,?,?,?,'mannequin')"
        ).bind(`github_${user.id}`, `${user.login}@github`, user.login, user.avatar_url)
      )
    );
  for (const user of unique.values())
    known.set(user.login, user.login === importer.login ? importer.userId : `github_${user.id}`);
  return (user: GitHubUser) => (user ? known.get(user.login)! : importer.userId);
}
