import type { OnboardingStep } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import type { Env } from '../core/platform';
import { json } from '../http/http';

type Progress = Record<OnboardingStep, number> & { dismissedAt: string | null };

const ownedRepositories =
  'repositories JOIN organization_members owners ON owners.organization_id=repositories.organization_id AND owners.user_id=?1 WHERE repositories.deletion_scheduled_at IS NULL';

export async function onboardingProgress(env: Env, principal: Principal) {
  const progress = await env.DB.prepare(
    `SELECT users.onboarding_dismissed_at AS dismissedAt,
      EXISTS(SELECT 1 FROM ${ownedRepositories}) AS repository,
      EXISTS(SELECT 1 FROM branches WHERE repository_id IN (SELECT repositories.id FROM ${ownedRepositories})) AS push,
      EXISTS(SELECT 1 FROM repository_collaborators WHERE repository_id IN (SELECT repositories.id FROM ${ownedRepositories}))
        OR EXISTS(SELECT 1 FROM organization_members mine JOIN organization_members other ON other.organization_id=mine.organization_id AND other.user_id<>mine.user_id WHERE mine.user_id=?1) AS teammate,
      EXISTS(SELECT 1 FROM pull_requests WHERE author_id=?1) AS pull,
      EXISTS(SELECT 1 FROM runners JOIN organization_members ON organization_members.organization_id=runners.organization_id WHERE organization_members.user_id=?1 AND runners.disabled_at IS NULL) AS runner
    FROM users WHERE users.id=?1`
  )
    .bind(principal.id)
    .first<Progress>();
  if (!progress || progress.dismissedAt) return null;
  const steps = (['repository', 'push', 'teammate', 'pull', 'runner'] as const).map((id) => ({
    id,
    done: Boolean(progress[id])
  }));
  return steps.every((step) => step.done) ? null : steps;
}

export async function dismissOnboarding(env: Env, principal: Principal) {
  await env.DB.prepare('UPDATE users SET onboarding_dismissed_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(principal.id)
    .run();
  return json({ dismissed: true });
}
