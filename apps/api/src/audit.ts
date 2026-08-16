import type { Principal } from './auth';
import { identifier } from './domain';
import type { D1PreparedStatement, Env } from './platform';

export type AuditEvent = {
  organizationId: string;
  repositoryId?: string | null;
  actor?: Principal | null;
  action: string;
  subjectType: string;
  subjectId: string;
  details?: Record<string, unknown>;
};

export function auditStatement(env: Env, event: AuditEvent): D1PreparedStatement {
  return env.DB.prepare('INSERT INTO audit_events (id,organization_id,repository_id,actor_id,actor_handle,action,subject_type,subject_id,details_json) VALUES (?,?,?,?,?,?,?,?,?)').bind(
    identifier('audit'), event.organizationId, event.repositoryId ?? null, event.actor?.id ?? null, event.actor?.handle ?? 'system', event.action, event.subjectType, event.subjectId, JSON.stringify(event.details ?? {})
  );
}
