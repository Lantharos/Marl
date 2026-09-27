import type { Principal } from '../auth/principal';
import { requireFreshSession } from '../auth/principal';
import { auditStatement } from '../core/audit';
import { identifier, validIdentitySlug } from '../core/domain';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import { createOrganizationBody, organizationSettingsBody } from '../http/request-schemas';
import { organizationRole, requireOrganizationRole } from '../repositories/access/access';
import { readImageAsset, readImageUpload, storedImageKey } from '../core/image-assets';

export type RepositoryOwner = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  kind: 'personal' | 'team';
  role: string;
};

export async function listRepositoryOwners(env: Env, principal: Principal): Promise<RepositoryOwner[]> {
  if (principal.authType === 'token') return [];
  const rows = await env.DB.prepare(
    `SELECT organizations.slug,organizations.name,organizations.avatar_url AS avatarUrl,organizations.kind,organization_members.role FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? ORDER BY organizations.kind,organizations.name`
  )
    .bind(principal.id)
    .all<RepositoryOwner>();
  return rows.results;
}

export async function listOrganizations(env: Env, principal: Principal) {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const rows = await env.DB.prepare(
    `SELECT organizations.id,organizations.slug,organizations.name,organizations.avatar_url AS avatarUrl,organizations.kind,organizations.base_repository_role AS baseRepositoryRole,organization_members.role,(SELECT COUNT(*) FROM organization_members AS members WHERE members.organization_id=organizations.id) AS members,(SELECT COUNT(*) FROM repositories WHERE repositories.organization_id=organizations.id AND repositories.deletion_scheduled_at IS NULL) AS repositories FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? ORDER BY organizations.kind,organizations.name`
  )
    .bind(principal.id)
    .all();
  return json({
    organizations: rows.results.filter((organization) => organization.kind === 'team'),
    repositoryOwners: rows.results
  });
}

export async function createOrganization(request: Request, env: Env, principal: Principal) {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const body = await readJson(request, createOrganizationBody);
  if (!body || !validIdentitySlug(body.slug))
    return problem(422, 'invalid_organization', 'Organization details are invalid.');
  const id = identifier('org');
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id,slug,name,kind,base_repository_role) VALUES (?,?,?,'team',?)`).bind(
        id,
        body.slug,
        body.name,
        body.baseRepositoryRole ?? 'read'
      ),
      env.DB.prepare(`INSERT INTO organization_members (organization_id,user_id,role) VALUES (?,?,'owner')`).bind(
        id,
        principal.id
      ),
      auditStatement(env, {
        organizationId: id,
        actor: principal,
        action: 'organization.created',
        subjectType: 'organization',
        subjectId: id,
        details: { slug: body.slug }
      })
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique'))
      return problem(409, 'organization_exists', 'That organization name is already in use.');
    throw error;
  }
  return json(
    {
      organization: {
        id,
        slug: body.slug,
        name: body.name,
        avatarUrl: null,
        description: '',
        website: null,
        kind: 'team',
        baseRepositoryRole: body.baseRepositoryRole ?? 'read',
        role: 'owner'
      }
    },
    { status: 201 }
  );
}

export async function getOrganization(env: Env, principal: Principal, slug: string) {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const organization = await organizationBySlug(env, slug);
  if (!organization) return problem(404, 'organization_not_found', 'Organization not found.');
  const viewerRole = await organizationRole(env, principal, organization.id);
  return viewerRole
    ? json({ organization, viewerRole })
    : problem(404, 'organization_not_found', 'Organization not found.');
}

export async function getOrganizationAccess(env: Env, principal: Principal, slug: string) {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const organization = await organizationBySlug(env, slug);
  if (!organization) return problem(404, 'organization_not_found', 'Organization not found.');
  const viewerRole = await organizationRole(env, principal, organization.id);
  if (!viewerRole) return problem(404, 'organization_not_found', 'Organization not found.');
  const [members, teams, teamMembers] = await Promise.all([
    env.DB.prepare(
      `SELECT users.id,users.handle,users.display_name AS displayName,users.email,users.avatar_url AS avatarUrl,organization_members.role,organization_members.created_at AS joinedAt FROM organization_members JOIN users ON users.id=organization_members.user_id WHERE organization_members.organization_id=? ORDER BY CASE organization_members.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,users.handle`
    )
      .bind(organization.id)
      .all(),
    env.DB.prepare(
      `SELECT teams.id,teams.slug,teams.name,teams.description,COUNT(team_members.user_id) AS members FROM teams LEFT JOIN team_members ON team_members.team_id=teams.id WHERE teams.organization_id=? GROUP BY teams.id ORDER BY teams.name`
    )
      .bind(organization.id)
      .all(),
    env.DB.prepare(
      `SELECT team_members.team_id AS teamId,users.id AS userId,users.handle,users.display_name AS displayName FROM team_members JOIN teams ON teams.id=team_members.team_id JOIN users ON users.id=team_members.user_id WHERE teams.organization_id=? ORDER BY users.handle`
    )
      .bind(organization.id)
      .all()
  ]);
  const invitations =
    viewerRole === 'member'
      ? []
      : (
          await env.DB.prepare(
            `SELECT organization_invitations.id,organization_invitations.email,organization_invitations.role,users.handle AS invitedBy,organization_invitations.expires_at AS expiresAt,organization_invitations.created_at AS createdAt FROM organization_invitations JOIN users ON users.id=organization_invitations.invited_by WHERE organization_invitations.organization_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY organization_invitations.created_at DESC`
          )
            .bind(organization.id)
            .all()
        ).results;
  return json({
    organization,
    viewerRole,
    members: members.results,
    teams: teams.results,
    teamMembers: teamMembers.results,
    invitations
  });
}

export async function updateOrganization(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity as an organization owner.');
  const body = await readJson(request, organizationSettingsBody);
  if (!body) return problem(422, 'invalid_organization', 'Organization settings are invalid.');
  const name = body.name?.trim() ?? organization.name;
  const description = body.description?.trim() ?? organization.description;
  const website = body.website?.trim() ?? organization.website ?? '';
  if (!validWebsite(website))
    return problem(422, 'invalid_organization_website', 'Use a valid HTTP or HTTPS website address.');
  const baseRole =
    organization.kind === 'personal' ? null : (body.baseRepositoryRole ?? organization.baseRepositoryRole ?? 'read');
  await env.DB.batch([
    env.DB.prepare('UPDATE organizations SET name=?,description=?,website=?,base_repository_role=? WHERE id=?').bind(
      name,
      description,
      website || null,
      baseRole,
      organization.id
    ),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.settings.updated',
      subjectType: 'organization',
      subjectId: organization.id,
      details: { name, description, website: website || null, baseRepositoryRole: baseRole }
    })
  ]);
  return json({
    organization: { ...organization, name, description, website: website || null, baseRepositoryRole: baseRole }
  });
}

export async function uploadOrganizationAvatar(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  const image = await readImageUpload(request);
  if (!image) return problem(422, 'invalid_avatar', 'Choose a valid PNG, JPEG, or WebP image under 2 MB.');
  const key = `organization-avatars/${organization.id}/${image.version}.${image.extension}`;
  const avatarUrl = `/api/v1/organization-avatars/${organization.id}/${image.version}.${image.extension}`;
  await env.OBJECTS.put(key, image.bytes, { httpMetadata: { contentType: image.contentType } });
  try {
    await env.DB.prepare('UPDATE organizations SET avatar_url=? WHERE id=?').bind(avatarUrl, organization.id).run();
  } catch (error) {
    await env.OBJECTS.delete(key);
    throw error;
  }
  const previousKey =
    organization.avatarUrl && storedImageKey(organization.avatarUrl, 'organization-avatars', organization.id);
  if (previousKey) await env.OBJECTS.delete(previousKey);
  return json({ avatarUrl });
}

export async function readOrganizationAvatar(env: Env, organizationId: string, file: string) {
  if (!/^org_[a-z0-9]+$/.test(organizationId) || !/^[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(file))
    return problem(404, 'avatar_not_found', 'Avatar not found.');
  return readImageAsset(env, `organization-avatars/${organizationId}/${file}`);
}

export async function organizationBySlug(env: Env, slug: string) {
  return env.DB.prepare(
    'SELECT id,slug,name,avatar_url AS avatarUrl,description,website,kind,base_repository_role AS baseRepositoryRole FROM organizations WHERE slug=? COLLATE NOCASE'
  )
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      name: string;
      avatarUrl: string | null;
      description: string;
      website: string | null;
      kind: 'personal' | 'team';
      baseRepositoryRole: string | null;
    }>();
}

function validWebsite(value: string) {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
