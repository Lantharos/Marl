import { legalVersion } from '@marl/contracts';
import { requireFreshSession, type Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { signToken, verifyToken } from '../../core/signed-token';
import { json, problem } from '../../http/http';
import { exportQueries, paged } from './export-queries';

type Row = { id: string } & Record<string, unknown>;

const jsonColumns = new Set(['labels', 'assets', 'comments']);

function clean(row: Row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      jsonColumns.has(key) && typeof value === 'string' ? JSON.parse(value) : value
    ])
  );
}

async function* list(env: Env, sql: string, values: unknown[], expand?: (row: Row) => AsyncGenerator<string>) {
  yield '[';
  let first = true;
  for await (const row of paged<Row>(env, sql, values)) {
    yield `${first ? '' : ','}${JSON.stringify(clean(row)).slice(0, -1)}`;
    if (expand) yield* expand(row);
    yield '}';
    first = false;
  }
  yield ']';
}

async function* field(name: string, value: AsyncGenerator<string>) {
  yield `,${JSON.stringify(name)}:`;
  yield* value;
}

async function* repositoryContents(env: Env, origin: string, repository: Row) {
  const path = `${repository.owner}/${repository.name}`;
  yield `,"cloneUrl":${JSON.stringify(`${env.GIT_PUBLIC_URL ?? origin}/${path}.git`)}`;
  yield `,"historyUrl":${JSON.stringify(`${origin}/api/v1/repositories/${path}/bundle`)}`;
  yield* field('labels', list(env, exportQueries.labels, [repository.id]));
  yield* field(
    'issues',
    list(env, exportQueries.issues, [repository.id], (issue) =>
      field('comments', list(env, exportQueries.issueComments, [issue.id]))
    )
  );
  yield* field(
    'pulls',
    list(env, exportQueries.pulls, [repository.id], async function* (pull) {
      yield* field('comments', list(env, exportQueries.pullComments, [pull.id]));
      yield* field('reviews', list(env, exportQueries.reviews, [pull.id]));
      yield* field('conversations', list(env, exportQueries.threads, [pull.id]));
    })
  );
  yield* field('releases', list(env, exportQueries.releases, [repository.id]));
}

async function accountRecord(env: Env, userId: string) {
  const [profile, emails, sshKeys, tokens, organizations, acceptances] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(
      'SELECT handle,display_name AS displayName,bio,website,avatar_url AS avatarUrl,created_at AS createdAt FROM users WHERE id=?'
    ).bind(userId),
    env.DB.prepare(
      'SELECT email,primary_email AS primaryEmail,verified_at AS verifiedAt,created_at AS createdAt FROM user_emails WHERE user_id=?'
    ).bind(userId),
    env.DB.prepare(
      'SELECT name,fingerprint,public_key AS publicKey,created_at AS createdAt,last_used_at AS lastUsedAt FROM ssh_keys WHERE user_id=?'
    ).bind(userId),
    env.DB.prepare(
      'SELECT name,token_prefix AS tokenPrefix,scopes_json AS scopes,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt FROM personal_access_tokens WHERE user_id=?'
    ).bind(userId),
    env.DB.prepare(
      'SELECT organizations.slug,organizations.name,organizations.kind,organization_members.role FROM organization_members JOIN organizations ON organizations.id=organization_members.organization_id WHERE organization_members.user_id=?'
    ).bind(userId),
    env.DB.prepare('SELECT version,accepted_at AS acceptedAt FROM legal_acceptances WHERE user_id=?').bind(userId)
  ]);
  return {
    ...profile.results[0],
    emails: emails.results,
    sshKeys: sshKeys.results,
    developerTokens: tokens.results.map((token) => ({ ...token, scopes: JSON.parse(String(token.scopes)) })),
    organizations: organizations.results,
    legalAcceptances: acceptances.results
  };
}

async function* exportDocument(env: Env, origin: string, userId: string) {
  const account = await accountRecord(env, userId);
  yield `{"format":"marl-account-export","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"termsVersion":${JSON.stringify(legalVersion)}`;
  yield `,"account":${JSON.stringify(account)}`;
  yield* field(
    'repositories',
    list(env, exportQueries.ownedRepositories, [userId], (repository) => repositoryContents(env, origin, repository))
  );
  yield ',"contributions":{"issues":';
  yield* list(env, exportQueries.authoredIssues, [userId]);
  for (const [name, sql] of [
    ['issueComments', exportQueries.authoredIssueComments],
    ['pulls', exportQueries.authoredPulls],
    ['pullComments', exportQueries.authoredPullComments],
    ['reviews', exportQueries.authoredReviews],
    ['reviewComments', exportQueries.authoredReviewComments]
  ] as const)
    yield* field(name, list(env, sql, [userId]));
  yield '}}';
}

export async function createExportLink(request: Request, env: Env, principal: Principal) {
  if (principal.authType !== 'session')
    return problem(403, 'browser_session_required', 'Download your data from a browser session.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before downloading your data.');
  const token = await signToken(env, 'account-export', principal.id, 600);
  return json({ url: `/api/v1/account/export?token=${encodeURIComponent(token)}` });
}

export async function downloadExport(env: Env, principal: Principal, url: URL) {
  const subject = await verifyToken(env, 'account-export', url.searchParams.get('token'));
  if (subject !== principal.id) return problem(403, 'export_link_expired', 'This download link has expired.');
  const encoder = new TextEncoder();
  const chunks = exportDocument(env, env.PUBLIC_URL || url.origin, principal.id);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    async cancel() {
      await chunks.return(undefined);
    }
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="marl-${principal.handle}-${date}.json"`,
      'cache-control': 'private, no-store'
    }
  });
}
