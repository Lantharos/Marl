import { env } from 'cloudflare:workers';
import { b, resource } from 'pult';
import { z } from 'zod';
import { likePattern } from '../http/list-query';
import { disableRepository, enableRepository } from './enforcement';

type Repository = {
  id: string;
  owner: string;
  name: string;
  visibility: 'private' | 'public';
  description: string;
  createdAt: string;
  archivedAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
};

const columns = `repositories.id,organizations.slug AS owner,repositories.name,repositories.visibility,repositories.description,repositories.created_at AS createdAt,repositories.archived_at AS archivedAt,repositories.disabled_at AS disabledAt,repositories.disabled_reason AS disabledReason FROM repositories JOIN organizations ON organizations.id=repositories.organization_id`;
const matches = `(organizations.slug || '/' || repositories.name LIKE ?1 ESCAPE '\\' OR repositories.description LIKE ?1 ESCAPE '\\')`;

export const repository = resource('repository', {
  icon: 'git-branch',
  plural: 'Repositories',
  get: (id) => env.DB.prepare(`SELECT ${columns} WHERE repositories.id=?`).bind(id).first<Repository>(),
  find: async (query, limit) =>
    (
      await env.DB.prepare(`SELECT ${columns} WHERE ${matches} ORDER BY organizations.slug,repositories.name LIMIT ?2`)
        .bind(likePattern(query), limit)
        .all<Repository>()
    ).results,
  list: {
    filters: z.object({
      visibility: z.enum(['public', 'private']).optional(),
      disabled: z.boolean().optional()
    }),
    run: async ({ query, filters, cursor, limit }) => {
      const rows = (
        await env.DB.prepare(
          `SELECT ${columns} WHERE ${matches} AND (?2 IS NULL OR repositories.visibility=?2) AND (?3 IS NULL OR (repositories.disabled_at IS NOT NULL)=?3) AND (?4 IS NULL OR repositories.id>?4) ORDER BY repositories.id LIMIT ?5`
        )
          .bind(
            likePattern(query),
            filters.visibility ?? null,
            filters.disabled === undefined ? null : Number(filters.disabled),
            cursor,
            limit + 1
          )
          .all<Repository>()
      ).results;
      return { records: rows.slice(0, limit), cursor: rows.length > limit ? rows[limit - 1]!.id : null };
    }
  },
  title: (r) => `${r.owner}/${r.name}`,
  subtitle: (r) => r.description || undefined,
  fields: (r) => ({ visibility: r.visibility, created: new Date(r.createdAt), disabled: Boolean(r.disabledAt) }),
  url: (r) => `${env.PUBLIC_URL}/${r.owner}/${r.name}`,
  render: (r) => [
    b.fields({
      visibility: r.visibility,
      created: new Date(r.createdAt),
      archived: r.archivedAt ? new Date(r.archivedAt) : undefined,
      disabled: r.disabledAt ? new Date(r.disabledAt) : undefined,
      'disabled because': r.disabledReason ?? undefined
    }),
    ...(r.description ? [b.markdown(r.description)] : [])
  ],
  related: {
    owners: {
      resource: 'user',
      label: 'Owners',
      list: async (r, limit) =>
        (
          await env.DB.prepare(
            `SELECT users.id,users.handle,users.display_name AS displayName,users.kind,users.created_at AS createdAt,users.suspended_at AS suspendedAt FROM repositories JOIN organization_members ON organization_members.organization_id=repositories.organization_id AND organization_members.role='owner' JOIN users ON users.id=organization_members.user_id WHERE repositories.id=? LIMIT ?`
          )
            .bind(r.id, limit)
            .all()
        ).results
    }
  },
  actions: (action) => ({
    disable: action({
      input: z.object({
        reason: z.string().trim().min(10).max(1000).describe('Sent to the owners and shown on the repository.')
      }),
      danger: 'confirm',
      automatable: true,
      when: (r) => !r.disabledAt,
      preview: ({ record }) => [
        b.markdown(
          `Hides **${record.owner}/${record.name}** everywhere, including Git, and cancels its queued and running jobs.`
        )
      ],
      run: async ({ record, input, actor }) =>
        (await disableRepository(env, actor, record.id, input.reason))
          ? `Disabled ${record.owner}/${record.name}`
          : `Disabled ${record.owner}/${record.name}, but some owners could not be emailed`
    }),
    enable: action({
      danger: 'confirm',
      when: (r) => Boolean(r.disabledAt),
      run: async ({ record, actor }) => {
        await enableRepository(env, actor, record.id);
        return `Enabled ${record.owner}/${record.name}`;
      }
    })
  })
});
