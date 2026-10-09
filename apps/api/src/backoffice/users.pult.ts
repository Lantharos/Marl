import { env } from 'cloudflare:workers';
import { b, resource } from 'pult';
import { z } from 'zod';
import { likePattern } from '../http/list-query';
import { restoreUser, signOutEverywhere, suspendUser } from './enforcement';

type User = {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  kind: 'person' | 'agent' | 'mannequin';
  bio: string;
  createdAt: string;
  deletedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  twoFactorEnabled: number;
};

const columns = `users.id,users.handle,users.display_name AS displayName,users.email,users.kind,users.bio,users.created_at AS createdAt,users.deleted_at AS deletedAt,users.suspended_at AS suspendedAt,users.suspension_reason AS suspensionReason,COALESCE((SELECT two_factor_enabled FROM auth_user WHERE auth_user.id=users.id),0) AS twoFactorEnabled`;

function hiddenEmail(email: string) {
  const [name, domain] = email.split('@');
  return `${name?.[0] ?? ''}…@${domain}`;
}

const reasonInput = z.object({
  reason: z.string().trim().min(10).max(1000).describe('Sent to the person in the suspension email.')
});

export const user = resource('user', {
  icon: 'user',
  get: (id) => env.DB.prepare(`SELECT ${columns} FROM users WHERE id=?`).bind(id).first<User>(),
  find: async (query, limit) =>
    (
      await env.DB.prepare(
        `SELECT ${columns} FROM users WHERE handle LIKE ?1 ESCAPE '\\' OR display_name LIKE ?1 ESCAPE '\\' OR email LIKE ?1 ESCAPE '\\' ORDER BY handle LIMIT ?2`
      )
        .bind(likePattern(query), limit)
        .all<User>()
    ).results,
  list: {
    filters: z.object({
      kind: z.enum(['person', 'agent', 'mannequin']).optional(),
      suspended: z.boolean().optional()
    }),
    run: async ({ query, filters, cursor, limit }) => {
      const rows = (
        await env.DB.prepare(
          `SELECT ${columns} FROM users WHERE (?1 IS NULL OR kind=?1) AND (?2 IS NULL OR (suspended_at IS NOT NULL)=?2) AND (handle LIKE ?3 ESCAPE '\\' OR display_name LIKE ?3 ESCAPE '\\') AND (?4 IS NULL OR id>?4) ORDER BY id LIMIT ?5`
        )
          .bind(
            filters.kind ?? null,
            filters.suspended === undefined ? null : Number(filters.suspended),
            likePattern(query),
            cursor,
            limit + 1
          )
          .all<User>()
      ).results;
      return { records: rows.slice(0, limit), cursor: rows.length > limit ? rows[limit - 1]!.id : null };
    }
  },
  title: (u) => `@${u.handle}`,
  subtitle: (u) => u.displayName,
  fields: (u) => ({ kind: u.kind, joined: new Date(u.createdAt), suspended: Boolean(u.suspendedAt) }),
  url: (u) => `${env.PUBLIC_URL}/${u.handle}`,
  render: (u) => [
    b.fields({
      name: u.displayName,
      email: u.email ? b.sensitive(u.email, { hint: hiddenEmail(u.email) }) : undefined,
      kind: u.kind,
      'two-factor': Boolean(u.twoFactorEnabled),
      joined: new Date(u.createdAt),
      deleted: u.deletedAt ? new Date(u.deletedAt) : undefined,
      suspended: u.suspendedAt ? new Date(u.suspendedAt) : undefined,
      'suspension reason': u.suspensionReason ?? undefined
    }),
    ...(u.bio ? [b.markdown(u.bio)] : [])
  ],
  related: {
    repositories: {
      resource: 'repository',
      label: 'Repositories',
      list: async (u, limit) =>
        (
          await env.DB.prepare(
            `SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.visibility,repositories.description,repositories.created_at AS createdAt,repositories.archived_at AS archivedAt,repositories.disabled_at AS disabledAt,repositories.disabled_reason AS disabledReason FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.kind='personal' AND organization_members.user_id=? ORDER BY repositories.created_at DESC LIMIT ?`
          )
            .bind(u.id, limit)
            .all()
        ).results
    },
    organizations: {
      resource: 'organization',
      label: 'Organizations',
      list: async (u, limit) =>
        (
          await env.DB.prepare(
            `SELECT organizations.id,organizations.slug,organizations.name,organizations.kind,organizations.created_at AS createdAt FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? AND organizations.kind='team' ORDER BY organizations.slug LIMIT ?`
          )
            .bind(u.id, limit)
            .all()
        ).results
    }
  },
  actions: (action) => ({
    suspend: action({
      input: reasonInput,
      danger: 'reauth',
      when: (u) => u.kind === 'person' && !u.suspendedAt && !u.deletedAt,
      preview: () => [
        b.markdown(
          'Signs them out everywhere, revokes their tokens, disables their personal repositories and cancels running jobs.'
        )
      ],
      run: async ({ record, input, actor }) =>
        (await suspendUser(env, actor, record, input.reason))
          ? `Suspended @${record.handle}`
          : `Suspended @${record.handle}, but the email to them could not be sent`
    }),
    restore: action({
      danger: 'confirm',
      when: (u) => Boolean(u.suspendedAt),
      run: async ({ record, actor }) => {
        await restoreUser(env, actor, record.id);
        return `Restored @${record.handle}`;
      }
    }),
    signOut: action({
      label: 'Sign out everywhere',
      danger: 'confirm',
      when: (u) => u.kind === 'person' && !u.deletedAt,
      run: async ({ record, actor }) => {
        await signOutEverywhere(env, actor, record.id);
        return `Signed @${record.handle} out of every device`;
      }
    })
  })
});
