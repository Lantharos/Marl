import type { Principal } from './auth';
import type { D1PreparedStatement, Env } from './platform';

type MentionSource = { kind: 'issue' | 'pull'; id: string };
type MentionContentKind = 'issue_body' | 'issue_comment' | 'pull_body' | 'pull_comment' | 'pull_review' | 'review_comment';

export async function mentionStatements(env: Env, actor: Principal, source: MentionSource, contentKind: MentionContentKind, contentId: string, content: string, createdAt: string): Promise<D1PreparedStatement[]> {
  const handles = parseMentionHandles(content).filter((handle) => handle !== actor.handle.toLowerCase());
  const users = handles.length
    ? await env.DB.prepare(`SELECT id,handle FROM users WHERE handle IN (${handles.map(() => '?').join(',')})`).bind(...handles).all<{ id: string; handle: string }>()
    : { results: [] };
  return [
    env.DB.prepare('DELETE FROM content_mentions WHERE content_kind=? AND content_id=?').bind(contentKind, contentId),
    ...users.results.map((user) => env.DB.prepare('INSERT INTO content_mentions (user_id,actor_id,source_issue_id,source_pull_id,content_kind,content_id,created_at) VALUES (?,?,?,?,?,?,?)').bind(user.id, actor.id, source.kind === 'issue' ? source.id : null, source.kind === 'pull' ? source.id : null, contentKind, contentId, createdAt))
  ];
}

export function deleteMentionStatements(env: Env, contentKind: MentionContentKind, contentId: string) {
  return [env.DB.prepare('DELETE FROM content_mentions WHERE content_kind=? AND content_id=?').bind(contentKind, contentId)];
}

export function parseMentionHandles(content: string) {
  const text = content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const handles = new Set<string>();
  for (const match of text.matchAll(/(^|[^\w@])@([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)(?![a-z0-9-])/gim)) {
    handles.add(match[2].toLowerCase());
    if (handles.size >= 20) break;
  }
  return [...handles];
}
