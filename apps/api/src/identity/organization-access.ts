import type { Principal } from '../auth/principal';
import { requireFreshSession, sha256 } from '../auth/principal';
import { auditStatement } from '../core/audit';
import { identifier, validSlug } from '../core/domain';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import {
  createTeamBody,
  organizationInvitationBody,
  organizationMemberBody,
  teamMemberBody
} from '../http/request-schemas';
import { requireOrganizationRole } from '../repositories/access/access';
import { sendTransactionalEmail } from '../core/email';
import { organizationBySlug } from './organizations';

export async function inviteOrganizationMember(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  if (organization.kind === 'personal')
    return problem(422, 'personal_organization', 'Personal organizations cannot have additional members.');
  const body = await readJson(request, organizationInvitationBody);
  if (!body || !/^\S+@\S+\.\S+$/.test(body.email))
    return problem(422, 'invalid_invitation', 'Invitation details are invalid.');
  const rawToken = randomToken();
  const invitationId = identifier('invite');
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO organization_invitations (id,organization_id,email,role,token_hash,invited_by,expires_at) VALUES (?,?,?,?,?,?,?)`
    ).bind(
      invitationId,
      organization.id,
      body.email.toLowerCase(),
      body.role,
      await sha256(rawToken),
      principal.id,
      expiresAt
    ),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.invitation.created',
      subjectType: 'invitation',
      subjectId: invitationId,
      details: { email: body.email.toLowerCase(), role: body.role }
    })
  ]);
  const invitationUrl = `${env.PUBLIC_URL ?? new URL(request.url).origin}/invitations/${rawToken}`;
  try {
    await sendTransactionalEmail(env, {
      recipient: body.email,
      subject: `Join ${organization.name} on Marl`,
      heading: `You are invited to ${organization.name}`,
      body: `${principal.displayName} invited you to collaborate on Marl.`,
      actionLabel: 'Accept invitation',
      actionUrl: invitationUrl
    });
  } catch {
    await env.DB.prepare('UPDATE organization_invitations SET revoked_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(invitationId)
      .run();
    return problem(502, 'invitation_delivery_failed', 'The invitation could not be delivered. Try again in a moment.');
  }
  return json(
    { invitation: { id: invitationId, email: body.email.toLowerCase(), role: body.role, expiresAt } },
    { status: 201 }
  );
}

export async function acceptOrganizationInvitation(env: Env, principal: Principal, token: string) {
  const invitation = await env.DB.prepare(
    `SELECT organization_invitations.id,organization_invitations.organization_id AS organizationId,organization_invitations.email,organization_invitations.role,organizations.slug,organizations.name FROM organization_invitations JOIN organizations ON organizations.id=organization_invitations.organization_id WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`
  )
    .bind(await sha256(token))
    .first<{
      id: string;
      organizationId: string;
      email: string;
      role: 'admin' | 'member';
      slug: string;
      name: string;
    }>();
  if (!invitation) return problem(404, 'invitation_not_found', 'This invitation is invalid or expired.');
  if (!principal.email || principal.email.toLowerCase() !== invitation.email.toLowerCase())
    return problem(403, 'invitation_email_mismatch', 'Sign in with the email address that received this invitation.');
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO organization_members (organization_id,user_id,role) VALUES (?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role'
    ).bind(invitation.organizationId, principal.id, invitation.role),
    env.DB.prepare(
      'UPDATE organization_invitations SET accepted_at=CURRENT_TIMESTAMP WHERE id=? AND accepted_at IS NULL'
    ).bind(invitation.id),
    auditStatement(env, {
      organizationId: invitation.organizationId,
      actor: principal,
      action: 'organization.invitation.accepted',
      subjectType: 'invitation',
      subjectId: invitation.id,
      details: {}
    })
  ]);
  return json({ organization: { slug: invitation.slug, name: invitation.name } });
}

export async function updateOrganizationMember(
  request: Request,
  env: Env,
  principal: Principal,
  slug: string,
  userId: string
) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity as an organization owner.');
  const body = await readJson(request, organizationMemberBody);
  if (!body) return problem(422, 'invalid_member_role', 'Member role is invalid.');
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE organization_members SET role=? WHERE organization_id=? AND user_id=? AND role!='owner'`
    ).bind(body.role, organization.id, userId),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.member.role_changed',
      subjectType: 'user',
      subjectId: userId,
      details: { role: body.role }
    })
  ]);
  return json({ updated: true });
}

export async function removeOrganizationMember(
  request: Request,
  env: Env,
  principal: Principal,
  slug: string,
  userId: string
) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'owner')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity as an organization owner.');
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM team_members WHERE user_id=? AND team_id IN (SELECT id FROM teams WHERE organization_id=?) AND EXISTS (SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=? AND role!='owner')`
    ).bind(userId, organization.id, organization.id, userId),
    env.DB.prepare(`DELETE FROM organization_members WHERE organization_id=? AND user_id=? AND role!='owner'`).bind(
      organization.id,
      userId
    ),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.member.removed',
      subjectType: 'user',
      subjectId: userId,
      details: {}
    })
  ]);
  return json({ removed: true });
}

export async function revokeOrganizationInvitation(
  request: Request,
  env: Env,
  principal: Principal,
  slug: string,
  invitationId: string
) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity as an organization administrator.');
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE organization_invitations SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND accepted_at IS NULL AND revoked_at IS NULL'
    ).bind(invitationId, organization.id),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.invitation.revoked',
      subjectType: 'invitation',
      subjectId: invitationId,
      details: {}
    })
  ]);
  return json({ revoked: true });
}

export async function createTeam(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  if (organization.kind === 'personal')
    return problem(422, 'personal_organization', 'Personal organizations cannot have teams.');
  const body = await readJson(request, createTeamBody);
  if (!body || !validSlug(body.slug)) return problem(422, 'invalid_team', 'Team details are invalid.');
  const id = identifier('team');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO teams (id,organization_id,slug,name,description) VALUES (?,?,?,?,?)').bind(
      id,
      organization.id,
      body.slug,
      body.name,
      body.description ?? ''
    ),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.team.created',
      subjectType: 'team',
      subjectId: id,
      details: { slug: body.slug }
    })
  ]);
  return json(
    { team: { id, slug: body.slug, name: body.name, description: body.description ?? '', members: 0 } },
    { status: 201 }
  );
}

export async function addTeamMember(request: Request, env: Env, principal: Principal, slug: string, teamId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  const body = await readJson(request, teamMemberBody);
  if (!body) return problem(422, 'invalid_team_member', 'Team member is invalid.');
  const member = await env.DB.prepare(
    'SELECT 1 AS found FROM organization_members WHERE organization_id=? AND user_id=?'
  )
    .bind(organization.id, body.userId)
    .first();
  if (!member) return problem(422, 'organization_member_required', 'Only organization members can join teams.');
  await env.DB.batch([
    env.DB.prepare(
      'INSERT OR IGNORE INTO team_members (team_id,user_id) SELECT id,? FROM teams WHERE id=? AND organization_id=?'
    ).bind(body.userId, teamId, organization.id),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.team.member_added',
      subjectType: 'team',
      subjectId: teamId,
      details: { userId: body.userId }
    })
  ]);
  return json({ added: true });
}

export async function removeTeamMember(env: Env, principal: Principal, slug: string, teamId: string, userId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE id=? AND organization_id=?) AND user_id=?'
    ).bind(teamId, organization.id, userId),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.team.member_removed',
      subjectType: 'team',
      subjectId: teamId,
      details: { userId }
    })
  ]);
  return json({ removed: true });
}

export async function deleteTeam(request: Request, env: Env, principal: Principal, slug: string, teamId: string) {
  const organization = await organizationBySlug(env, slug);
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin')))
    return problem(404, 'organization_not_found', 'Organization not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity as an organization administrator.');
  const team = await env.DB.prepare('SELECT id,slug FROM teams WHERE id=? AND organization_id=?')
    .bind(teamId, organization.id)
    .first<{ id: string; slug: string }>();
  if (!team) return problem(404, 'team_not_found', 'Team not found.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM teams WHERE id=? AND organization_id=?').bind(teamId, organization.id),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'organization.team.deleted',
      subjectType: 'team',
      subjectId: teamId,
      details: { slug: team.slug }
    })
  ]);
  return json({ deleted: true });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
