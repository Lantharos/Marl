import type { Env } from '../core/platform';
import { GitHubError, RateLimited } from './github';
import { runStep, type ImportRow } from './steps';

const importSelect = `SELECT repository_imports.id,repository_imports.repository_id AS repositoryId,repositories.organization_id AS organizationId,organizations.slug AS owner,repositories.name,repository_imports.requested_by AS requestedBy,repository_imports.source,repository_imports.default_branch AS defaultBranch,repository_imports.token_ciphertext AS tokenCiphertext,repository_imports.token_nonce AS tokenNonce,repository_imports.github_login AS githubLogin,repository_imports.options_json AS optionsJson,repository_imports.step,repository_imports.cursor,repository_imports.stats_json AS statsJson FROM repository_imports JOIN repositories ON repositories.id=repository_imports.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE repository_imports.id=? AND repository_imports.status='running'`;

function finish(env: Env, id: string, status: 'completed' | 'failed', error: string | null) {
  return env.DB.prepare(
    'UPDATE repository_imports SET status=?,error=?,token_ciphertext=NULL,token_nonce=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?'
  )
    .bind(status, error, id)
    .run();
}

export async function runImports(batch: MessageBatch<{ importId: string }>, env: Env) {
  for (const message of batch.messages) {
    const row = await env.DB.prepare(importSelect).bind(message.body.importId).first<ImportRow>();
    if (!row) {
      message.ack();
      continue;
    }
    try {
      const result = await runStep(env, row);
      const stats = JSON.parse(row.statsJson) as Record<string, number>;
      for (const [key, value] of Object.entries(result.counts ?? {})) stats[key] = (stats[key] ?? 0) + value;
      await env.DB.prepare(
        'UPDATE repository_imports SET step=?,cursor=?,stats_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
      )
        .bind(result.step, result.cursor, JSON.stringify(stats), row.id)
        .run();
      if (result.step === 'finished') await finish(env, row.id, 'completed', null);
      else await env.IMPORT_QUEUE.send({ importId: row.id });
      message.ack();
    } catch (error) {
      if (error instanceof RateLimited) {
        message.retry({ delaySeconds: Math.min(error.retryAfter, 3600) });
        continue;
      }
      if (error instanceof GitHubError || message.attempts >= 5) {
        await finish(env, row.id, 'failed', error instanceof Error ? error.message : String(error));
        message.ack();
        continue;
      }
      console.error('Import step failed', { importId: row.id, step: row.step, error: String(error) });
      message.retry({ delaySeconds: 30 * message.attempts });
    }
  }
}
