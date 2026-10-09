import { env } from 'cloudflare:workers';
import { b, resource } from 'pult';
import { likePattern } from '../http/list-query';

type Organization = { id: string; slug: string; name: string; kind: 'personal' | 'team'; createdAt: string };

const columns = 'id,slug,name,kind,created_at AS createdAt FROM organizations';

export const organization = resource('organization', {
  icon: 'building',
  get: (id) => env.DB.prepare(`SELECT ${columns} WHERE id=?`).bind(id).first<Organization>(),
  find: async (query, limit) =>
    (
      await env.DB.prepare(
        `SELECT ${columns} WHERE kind='team' AND (slug LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\') ORDER BY slug LIMIT ?2`
      )
        .bind(likePattern(query), limit)
        .all<Organization>()
    ).results,
  title: (o) => o.slug,
  subtitle: (o) => o.name,
  fields: (o) => ({ kind: o.kind, created: new Date(o.createdAt) }),
  url: (o) => `${env.PUBLIC_URL}/${o.slug}`,
  render: (o) => [b.fields({ name: o.name, kind: o.kind, created: new Date(o.createdAt) })],
  related: {
    members: {
      resource: 'user',
      label: 'Members',
      list: async (o, limit) =>
        (
          await env.DB.prepare(
            `SELECT users.id,users.handle,users.display_name AS displayName,users.kind,users.created_at AS createdAt,users.suspended_at AS suspendedAt FROM organization_members JOIN users ON users.id=organization_members.user_id WHERE organization_members.organization_id=? ORDER BY users.handle LIMIT ?`
          )
            .bind(o.id, limit)
            .all()
        ).results
    },
    repositories: {
      resource: 'repository',
      label: 'Repositories',
      list: async (o, limit) =>
        (
          await env.DB.prepare(
            `SELECT repositories.id,? AS owner,repositories.name,repositories.visibility,repositories.description,repositories.created_at AS createdAt,repositories.disabled_at AS disabledAt FROM repositories WHERE organization_id=? ORDER BY repositories.name LIMIT ?`
          )
            .bind(o.slug, o.id, limit)
            .all()
        ).results
    }
  }
});
