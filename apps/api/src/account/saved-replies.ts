import type { SavedReply } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import { identifier } from '../core/domain';
import type { Env } from '../core/platform';
import { json, problem, readJson } from '../http/http';
import { savedReplyBody } from '../http/request-schemas';

const maximumReplies = 100;
const replySelect =
  'SELECT id,title,body,updated_at AS updatedAt FROM saved_replies WHERE user_id=? ORDER BY title COLLATE NOCASE,id';

export async function listSavedReplies(env: Env, principal: Principal) {
  const rows = await env.DB.prepare(replySelect).bind(principal.id).all<SavedReply>();
  return json({ replies: rows.results });
}

export async function createSavedReply(request: Request, env: Env, principal: Principal) {
  const body = await readJson(request, savedReplyBody);
  if (!body?.title.trim() || !body.body.trim())
    return problem(422, 'invalid_saved_reply', 'Give the reply a title and some text.');
  const id = identifier('reply');
  const created = await env.DB.prepare(
    `INSERT INTO saved_replies (id,user_id,title,body) SELECT ?1,?2,?3,?4 WHERE (SELECT COUNT(*) FROM saved_replies WHERE user_id=?2)<${maximumReplies} RETURNING id,title,body,updated_at AS updatedAt`
  )
    .bind(id, principal.id, body.title.trim(), body.body)
    .first<SavedReply>();
  if (!created) return problem(409, 'saved_reply_limit', `You can keep up to ${maximumReplies} saved replies.`);
  return json({ reply: created }, { status: 201 });
}

export async function updateSavedReply(request: Request, env: Env, principal: Principal, id: string) {
  const body = await readJson(request, savedReplyBody);
  if (!body?.title.trim() || !body.body.trim())
    return problem(422, 'invalid_saved_reply', 'Give the reply a title and some text.');
  const reply = await env.DB.prepare(
    'UPDATE saved_replies SET title=?,body=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? RETURNING id,title,body,updated_at AS updatedAt'
  )
    .bind(body.title.trim(), body.body, id, principal.id)
    .first<SavedReply>();
  return reply ? json({ reply }) : problem(404, 'saved_reply_not_found', 'Saved reply not found.');
}

export async function deleteSavedReply(env: Env, principal: Principal, id: string) {
  await env.DB.prepare('DELETE FROM saved_replies WHERE id=? AND user_id=?').bind(id, principal.id).run();
  return new Response(null, { status: 204 });
}
