import { validSlug } from './domain';
import { json, problem } from './http';
import type { Env } from './platform';

type ContributionRow = { date: string; count: number };

const publicRepositories = `repositories.visibility='public' AND repositories.deletion_scheduled_at IS NULL`;

export async function getPublicUserProfile(env: Env, handle: string) {
  if (!validSlug(handle)) return notFound('user');
  const user = await env.DB.prepare('SELECT id,handle,display_name AS displayName,avatar_url AS avatarUrl,bio,website,created_at AS joinedAt,email FROM users WHERE handle=? COLLATE NOCASE').bind(handle).first<{ id: string; handle: string; displayName: string; avatarUrl: string | null; bio: string; website: string | null; joinedAt: string; email: string | null }>();
  if (!user) return notFound('user');

  const identity = `(commits.signature_signer_id=? OR (users.email IS NOT NULL AND users.email!='' AND commits.author_email=users.email COLLATE NOCASE))`;
  const [repositories, repositoryCount, organizations, contributions, activity, pullRequests] = await Promise.all([
    env.DB.prepare(`SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.description,repositories.visibility,repositories.default_branch AS defaultBranch,repositories.updated_at AS updatedAt FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? AND organizations.kind='personal' AND ${publicRepositories} ORDER BY repositories.updated_at DESC LIMIT 12`).bind(user.id).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? AND organizations.kind='personal' AND ${publicRepositories}`).bind(user.id).first<{ count: number }>(),
    env.DB.prepare(`SELECT organizations.slug,organizations.name,organizations.avatar_url AS avatarUrl,organizations.description FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? AND organizations.kind='team' ORDER BY organizations.name LIMIT 12`).bind(user.id).all(),
    env.DB.prepare(`SELECT date(commits.authored_at) AS date,COUNT(*) AS count FROM commits JOIN repositories ON repositories.id=commits.repository_id JOIN users ON users.id=? WHERE ${publicRepositories} AND ${identity} AND date(commits.authored_at)>=date('now','-371 days') GROUP BY date(commits.authored_at) ORDER BY date(commits.authored_at)`).bind(user.id, user.id).all<ContributionRow>(),
    env.DB.prepare(`SELECT commits.id,commits.title,commits.authored_at AS authoredAt,organizations.slug AS owner,repositories.name AS repository FROM commits JOIN repositories ON repositories.id=commits.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN users ON users.id=? WHERE ${publicRepositories} AND ${identity} ORDER BY commits.authored_at DESC LIMIT 10`).bind(user.id, user.id).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM pull_requests JOIN repositories ON repositories.id=pull_requests.repository_id WHERE pull_requests.author_id=? AND ${publicRepositories}`).bind(user.id).first<{ count: number }>()
  ]);

  const contributionDays = contributions.results.map((day) => ({ ...day, count: Number(day.count) }));
  return json({
    profile: { handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl, bio: user.bio, website: user.website, joinedAt: user.joinedAt },
    stats: { repositories: Number(repositoryCount?.count ?? 0), contributions: contributionDays.reduce((sum, day) => sum + day.count, 0), pullRequests: Number(pullRequests?.count ?? 0) },
    contributions: contributionDays,
    repositories: repositories.results,
    organizations: organizations.results,
    activity: activity.results
  });
}

export async function getPublicOrganizationProfile(env: Env, slug: string) {
  if (!validSlug(slug)) return notFound('organization');
  const organization = await env.DB.prepare('SELECT id,slug,name,avatar_url AS avatarUrl,description,website,kind,created_at AS createdAt FROM organizations WHERE slug=? COLLATE NOCASE').bind(slug).first<{ id: string; slug: string; name: string; avatarUrl: string | null; description: string; website: string | null; kind: 'personal' | 'team'; createdAt: string }>();
  if (!organization) return notFound('organization');

  const [repositories, repositoryCount, members, activity, contributionCount, totalMembers] = await Promise.all([
    env.DB.prepare(`SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.description,repositories.visibility,repositories.default_branch AS defaultBranch,repositories.updated_at AS updatedAt FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.organization_id=? AND ${publicRepositories} ORDER BY repositories.updated_at DESC LIMIT 18`).bind(organization.id).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM repositories WHERE repositories.organization_id=? AND ${publicRepositories}`).bind(organization.id).first<{ count: number }>(),
    env.DB.prepare(`SELECT users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl,organization_members.role FROM organization_members JOIN users ON users.id=organization_members.user_id WHERE organization_members.organization_id=? ORDER BY CASE organization_members.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,users.handle LIMIT 24`).bind(organization.id).all(),
    env.DB.prepare(`SELECT commits.id,commits.title,commits.authored_at AS authoredAt,users.handle AS author,users.avatar_url AS authorAvatarUrl,repositories.name AS repository FROM commits JOIN repositories ON repositories.id=commits.repository_id LEFT JOIN users ON users.id=commits.signature_signer_id OR (commits.signature_signer_id IS NULL AND users.email IS NOT NULL AND users.email!='' AND commits.author_email=users.email COLLATE NOCASE) WHERE repositories.organization_id=? AND ${publicRepositories} ORDER BY commits.authored_at DESC LIMIT 10`).bind(organization.id).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM commits JOIN repositories ON repositories.id=commits.repository_id WHERE repositories.organization_id=? AND ${publicRepositories} AND date(commits.authored_at)>=date('now','-365 days')`).bind(organization.id).first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM organization_members WHERE organization_id=?').bind(organization.id).first<{ count: number }>()
  ]);

  return json({
    organization: { slug: organization.slug, name: organization.name, avatarUrl: organization.avatarUrl, description: organization.description, website: organization.website, kind: organization.kind, createdAt: organization.createdAt },
    stats: { repositories: Number(repositoryCount?.count ?? 0), members: Number(totalMembers?.count ?? 0), contributions: Number(contributionCount?.count ?? 0) },
    repositories: repositories.results,
    members: members.results,
    activity: activity.results
  });
}

function notFound(kind: 'user' | 'organization') {
  return problem(404, `${kind}_not_found`, `${kind === 'user' ? 'User' : 'Organization'} not found.`);
}
