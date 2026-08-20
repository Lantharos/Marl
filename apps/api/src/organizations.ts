import type { Principal } from './auth';
import { requireFreshSession, sha256 } from './auth';
import { auditStatement } from './audit';
import { identifier, validSlug } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { createOrganizationBody, createTeamBody, organizationInvitationBody, organizationMemberBody, organizationSettingsBody, teamMemberBody } from './request-schemas';
import { organizationRole, requireOrganizationRole } from './repository-access';
import { sendTransactionalEmail } from './email';
import { readImageAsset, readImageUpload, storedImageKey } from './image-assets';

export async function listOrganizations(env: Env, principal: Principal) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const rows = await env.DB.prepare(`SELECT organizations.id,organizations.slug,organizations.name,organizations.avatar_url AS avatarUrl,organizations.kind,organizations.base_repository_role AS baseRepositoryRole,organization_members.role,(SELECT COUNT(*) FROM organization_members AS members WHERE members.organization_id=organizations.id) AS members,(SELECT COUNT(*) FROM repositories WHERE repositories.organization_id=organizations.id AND repositories.deletion_scheduled_at IS NULL) AS repositories FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? ORDER BY organizations.kind,organizations.name`).bind(principal.id).all();
  return json({ organizations: rows.results });
}

export async function createOrganization(request: Request, env: Env, principal: Principal) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const body = await readJson(request, createOrganizationBody);
  if (!body || !validSlug(body.slug)) return problem(422, 'invalid_organization', 'Organization details are invalid.');
  const id = identifier('org');
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id,slug,name,kind,base_repository_role) VALUES (?,?,?,'team',?)`).bind(id, body.slug, body.name, body.baseRepositoryRole ?? 'read'),
      env.DB.prepare(`INSERT INTO organization_members (organization_id,user_id,role) VALUES (?,?,'owner')`).bind(id, principal.id),
      auditStatement(env, { organizationId: id, actor: principal, action: 'organization.created', subjectType: 'organization', subjectId: id, details: { slug: body.slug } })
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'organization_exists', 'That organization name is already in use.');
    throw error;
  }
  return json({ organization: { id, slug: body.slug, name: body.name, avatarUrl: null, description: '', website: null, kind: 'team', baseRepositoryRole: body.baseRepositoryRole ?? 'read', role: 'owner' } }, { status: 201 });
}

export async function getOrganization(env: Env, principal: Principal, slug: string) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const organization = await organizationBySlug(env, slug);
  if (!organization) return problem(404, 'organization_not_found', 'Organization not found.');
  const viewerRole = await organizationRole(env, principal, organization.id);
  return viewerRole ? json({ organization, viewerRole }) : problem(404, 'organization_not_found', 'Organization not found.');
}

export async function getOrganizationAccess(env: Env, principal: Principal, slug: string) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Organizations can only be managed from a browser session.');
  const organization = await organizationBySlug(env, slug);
  if (!organization) return problem(404, 'organization_not_found', 'Organization not found.');
  const viewerRole = await organizationRole(env, principal, organization.id);
  if (!viewerRole) return problem(404, 'organization_not_found', 'Organization not found.');
  const [members, teams, teamMembers] = await Promise.all([
    env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName,users.email,users.avatar_url AS avatarUrl,organization_members.role,organization_members.created_at AS joinedAt FROM organization_members JOIN users ON users.id=organization_members.user_id WHERE organization_members.organization_id=? ORDER BY CASE organization_members.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,users.handle`).bind(organization.id).all(),
    env.DB.prepare(`SELECT teams.id,teams.slug,teams.name,teams.description,COUNT(team_members.user_id) AS members FROM teams LEFT JOIN team_members ON team_members.team_id=teams.id WHERE teams.organization_id=? GROUP BY teams.id ORDER BY teams.name`).bind(organization.id).all(),
    env.DB.prepare(`SELECT team_members.team_id AS teamId,users.id AS userId,users.handle,users.display_name AS displayName FROM team_members JOIN teams ON teams.id=team_members.team_id JOIN users ON users.id=team_members.user_id WHERE teams.organization_id=? ORDER BY users.handle`).bind(organization.id).all()
  ]);
  const invitations = viewerRole === 'member'
    ? []
    : (await env.DB.prepare(`SELECT organization_invitations.id,organization_invitations.email,organization_invitations.role,users.handle AS invitedBy,organization_invitations.expires_at AS expiresAt,organization_invitations.created_at AS createdAt FROM organization_invitations JOIN users ON users.id=organization_invitations.invited_by WHERE organization_invitations.organization_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY organization_invitations.created_at DESC`).bind(organization.id).all()).results;
  return json({ organization, viewerRole, members: members.results, teams: teams.results, teamMembers: teamMembers.results, invitations });
}

export async function updateOrganization(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner')) || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_owner_session_required', 'Confirm your identity as an organization owner.');
  const body = await readJson(request, organizationSettingsBody);
  if (!body) return problem(422, 'invalid_organization', 'Organization settings are invalid.');
  const name = body.name?.trim() ?? organization.name;
  const description = body.description?.trim() ?? organization.description;
  const website = body.website?.trim() ?? organization.website ?? '';
  if (!validWebsite(website)) return problem(422, 'invalid_organization_website', 'Use a valid HTTP or HTTPS website address.');
  const baseRole = organization.kind === 'personal' ? null : body.baseRepositoryRole ?? organization.baseRepositoryRole ?? 'read';
  await env.DB.batch([
    env.DB.prepare('UPDATE organizations SET name=?,description=?,website=?,base_repository_role=? WHERE id=?').bind(name, description, website || null, baseRole, organization.id),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.settings.updated', subjectType: 'organization', subjectId: organization.id, details: { name, description, website: website || null, baseRepositoryRole: baseRole } })
  ]);
  return json({ organization: { ...organization, name, description, website: website || null, baseRepositoryRole: baseRole } });
}

export async function uploadOrganizationAvatar(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner'))) return problem(404, 'organization_not_found', 'Organization not found.');
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
  const previousKey = organization.avatarUrl && storedImageKey(organization.avatarUrl, 'organization-avatars', organization.id);
  if (previousKey) await env.OBJECTS.delete(previousKey);
  return json({ avatarUrl });
}

export async function readOrganizationAvatar(env: Env, organizationId: string, file: string) {
  if (!/^org_[a-z0-9]+$/.test(organizationId) || !/^[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(file)) return problem(404, 'avatar_not_found', 'Avatar not found.');
  return readImageAsset(env, `organization-avatars/${organizationId}/${file}`);
}

export async function inviteOrganizationMember(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin'))) return problem(404, 'organization_not_found', 'Organization not found.');
  if (organization.kind === 'personal') return problem(422, 'personal_organization', 'Personal organizations cannot have additional members.');
  const body = await readJson(request, organizationInvitationBody);
  if (!body || !/^\S+@\S+\.\S+$/.test(body.email)) return problem(422, 'invalid_invitation', 'Invitation details are invalid.');
  const rawToken = randomToken();
  const invitationId = identifier('invite');
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organization_invitations (id,organization_id,email,role,token_hash,invited_by,expires_at) VALUES (?,?,?,?,?,?,?)`).bind(invitationId, organization.id, body.email.toLowerCase(), body.role, await sha256(rawToken), principal.id, expiresAt),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.invitation.created', subjectType: 'invitation', subjectId: invitationId, details: { email: body.email.toLowerCase(), role: body.role } })
  ]);
  const invitationUrl = `${env.PUBLIC_URL ?? new URL(request.url).origin}/invitations/${rawToken}`;
  try {
    await sendTransactionalEmail(env, { recipient: body.email, subject: `Join ${organization.name} on Marl`, heading: `You are invited to ${organization.name}`, body: `${principal.displayName} invited you to collaborate on Marl.`, actionLabel: 'Accept invitation', actionUrl: invitationUrl });
  } catch {
      await env.DB.prepare('UPDATE organization_invitations SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').bind(invitationId).run();
      return problem(502, 'invitation_delivery_failed', 'The invitation could not be delivered. Try again in a moment.');
  }
  return json({ invitation: { id: invitationId, email: body.email.toLowerCase(), role: body.role, expiresAt } }, { status: 201 });
}

export async function acceptOrganizationInvitation(request: Request, env: Env, principal: Principal, token: string) {
  const invitation = await env.DB.prepare(`SELECT organization_invitations.id,organization_invitations.organization_id AS organizationId,organization_invitations.email,organization_invitations.role,organizations.slug,organizations.name FROM organization_invitations JOIN organizations ON organizations.id=organization_invitations.organization_id WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`).bind(await sha256(token)).first<{ id: string; organizationId: string; email: string; role: 'admin' | 'member'; slug: string; name: string }>();
  if (!invitation) return problem(404, 'invitation_not_found', 'This invitation is invalid or expired.');
  if (!principal.email || principal.email.toLowerCase() !== invitation.email.toLowerCase()) return problem(403, 'invitation_email_mismatch', 'Sign in with the email address that received this invitation.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organization_members (organization_id,user_id,role) VALUES (?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role').bind(invitation.organizationId, principal.id, invitation.role),
    env.DB.prepare('UPDATE organization_invitations SET accepted_at=CURRENT_TIMESTAMP WHERE id=? AND accepted_at IS NULL').bind(invitation.id),
    auditStatement(env, { organizationId: invitation.organizationId, actor: principal, action: 'organization.invitation.accepted', subjectType: 'invitation', subjectId: invitation.id, details: {} })
  ]);
  return json({ organization: { slug: invitation.slug, name: invitation.name } });
}

export async function updateOrganizationMember(request: Request, env: Env, principal: Principal, slug: string, userId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner')) || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_owner_session_required', 'Confirm your identity as an organization owner.');
  const body = await readJson(request, organizationMemberBody);
  if (!body) return problem(422, 'invalid_member_role', 'Member role is invalid.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE organization_members SET role=? WHERE organization_id=? AND user_id=? AND role!='owner'`).bind(body.role, organization.id, userId),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.member.role_changed', subjectType: 'user', subjectId: userId, details: { role: body.role } })
  ]);
  return json({ updated: true });
}

export async function removeOrganizationMember(request: Request, env: Env, principal: Principal, slug: string, userId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner')) || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_owner_session_required', 'Confirm your identity as an organization owner.');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM organization_members WHERE organization_id=? AND user_id=? AND role!='owner'`).bind(organization.id, userId),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.member.removed', subjectType: 'user', subjectId: userId, details: {} })
  ]);
  return json({ removed: true });
}

export async function revokeOrganizationInvitation(request: Request, env: Env, principal: Principal, slug: string, invitationId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')) || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity as an organization administrator.');
  await env.DB.batch([
    env.DB.prepare('UPDATE organization_invitations SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND accepted_at IS NULL AND revoked_at IS NULL').bind(invitationId, organization.id),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.invitation.revoked', subjectType: 'invitation', subjectId: invitationId, details: {} })
  ]);
  return json({ revoked: true });
}

export async function createTeam(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin'))) return problem(404, 'organization_not_found', 'Organization not found.');
  if (organization.kind === 'personal') return problem(422, 'personal_organization', 'Personal organizations cannot have teams.');
  const body = await readJson(request, createTeamBody);
  if (!body || !validSlug(body.slug)) return problem(422, 'invalid_team', 'Team details are invalid.');
  const id = identifier('team');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO teams (id,organization_id,slug,name,description) VALUES (?,?,?,?,?)').bind(id, organization.id, body.slug, body.name, body.description ?? ''),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.team.created', subjectType: 'team', subjectId: id, details: { slug: body.slug } })
  ]);
  return json({ team: { id, slug: body.slug, name: body.name, description: body.description ?? '', members: 0 } }, { status: 201 });
}

export async function addTeamMember(request: Request, env: Env, principal: Principal, slug: string, teamId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin'))) return problem(404, 'organization_not_found', 'Organization not found.');
  const body = await readJson(request, teamMemberBody);
  if (!body) return problem(422, 'invalid_team_member', 'Team member is invalid.');
  const member = await env.DB.prepare('SELECT 1 AS found FROM organization_members WHERE organization_id=? AND user_id=?').bind(organization.id, body.userId).first();
  if (!member) return problem(422, 'organization_member_required', 'Only organization members can join teams.');
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO team_members (team_id,user_id) SELECT id,? FROM teams WHERE id=? AND organization_id=?').bind(body.userId, teamId, organization.id),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.team.member_added', subjectType: 'team', subjectId: teamId, details: { userId: body.userId } })
  ]);
  return json({ added: true });
}

export async function removeTeamMember(request: Request, env: Env, principal: Principal, slug: string, teamId: string, userId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin'))) return problem(404, 'organization_not_found', 'Organization not found.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE id=? AND organization_id=?) AND user_id=?').bind(teamId, organization.id, userId),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.team.member_removed', subjectType: 'team', subjectId: teamId, details: { userId } })
  ]);
  return json({ removed: true });
}

export async function deleteTeam(request: Request, env: Env, principal: Principal, slug: string, teamId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')) || !(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity as an organization administrator.');
  const team = await env.DB.prepare('SELECT id,slug FROM teams WHERE id=? AND organization_id=?').bind(teamId, organization.id).first<{ id: string; slug: string }>();
  if (!team) return problem(404, 'team_not_found', 'Team not found.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM teams WHERE id=? AND organization_id=?').bind(teamId, organization.id),
    auditStatement(env, { organizationId: organization.id, actor: principal, action: 'organization.team.deleted', subjectType: 'team', subjectId: teamId, details: { slug: team.slug } })
  ]);
  return json({ deleted: true });
}

async function organizationBySlug(env: Env, slug: string) {
  return env.DB.prepare('SELECT id,slug,name,avatar_url AS avatarUrl,description,website,kind,base_repository_role AS baseRepositoryRole FROM organizations WHERE slug=? COLLATE NOCASE').bind(slug).first<{ id: string; slug: string; name: string; avatarUrl: string | null; description: string; website: string | null; kind: 'personal' | 'team'; baseRepositoryRole: string | null }>();
}

function validWebsite(value: string) {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
