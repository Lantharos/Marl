import type { WebhookEvent } from '@marl/contracts';
import { identifier } from '../core/domain';
import type { Env } from '../core/platform';

export type EventSubject =
  | { kind: 'push'; ref: string; before: string | null; after: string | null }
  | { kind: 'pull' | 'issue' | 'release' | 'run'; id: string }
  | { kind: 'review'; id: string }
  | { kind: 'comment'; id: string; on: 'issue' | 'pull' };

type Hook = { id: string; eventsJson: string };

const repositoryQuery = `SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.visibility,repositories.organization_id AS organizationId FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=?`;
const handle = (column: string) => `(SELECT handle FROM users WHERE users.id=${column})`;

const subjectQueries = {
  pull: `SELECT number,title,state,${handle('author_id')} AS author,source_branch AS sourceBranch,target_branch AS targetBranch,source_commit_id AS head,merged_commit_id AS mergedCommit FROM pull_requests WHERE id=?`,
  issue: `SELECT number,title,state,${handle('author_id')} AS author FROM issues WHERE id=?`,
  release: `SELECT tag_name AS tagName,name,prerelease,${handle('author_id')} AS author FROM releases WHERE id=?`,
  run: `SELECT number,name,state,branch,commit_id AS commit,${handle('actor_id')} AS author FROM runs WHERE id=?`,
  review: `SELECT pull_request_reviews.state,pull_request_reviews.body,${handle('pull_request_reviews.author_id')} AS author,pull_requests.number,pull_requests.title FROM pull_request_reviews JOIN pull_requests ON pull_requests.id=pull_request_reviews.pull_request_id WHERE pull_request_reviews.id=?`,
  issueComment: `SELECT issue_comments.body,${handle('issue_comments.author_id')} AS author,issues.number,issues.title FROM issue_comments JOIN issues ON issues.id=issue_comments.issue_id WHERE issue_comments.id=?`,
  pullComment: `SELECT pull_request_comments.body,${handle('pull_request_comments.author_id')} AS author,pull_requests.number,pull_requests.title FROM pull_request_comments JOIN pull_requests ON pull_requests.id=pull_request_comments.pull_request_id WHERE pull_request_comments.id=?`
} as const;

async function subjectData(env: Env, repositoryId: string, base: string, subject: EventSubject) {
  const one = (sql: string, id: string) => env.DB.prepare(sql).bind(id).first<Record<string, unknown>>();
  switch (subject.kind) {
    case 'push': {
      const head = subject.after
        ? await env.DB.prepare(
            'SELECT id,title,author_name AS author,authored_at AS authoredAt FROM commits WHERE repository_id=? AND id=?'
          )
            .bind(repositoryId, subject.after)
            .first()
        : null;
      return {
        ref: subject.ref,
        before: subject.before,
        after: subject.after,
        headCommit: head && { ...head, url: `${base}/commit/${subject.after}` }
      };
    }
    case 'pull': {
      const pull = await one(subjectQueries.pull, subject.id);
      return pull && { pull: { ...pull, url: `${base}/pulls/${pull.number}` } };
    }
    case 'issue': {
      const issue = await one(subjectQueries.issue, subject.id);
      return issue && { issue: { ...issue, url: `${base}/issues/${issue.number}` } };
    }
    case 'release': {
      const release = await one(subjectQueries.release, subject.id);
      return (
        release && {
          release: { ...release, url: `${base}/releases/tag/${encodeURIComponent(String(release.tagName))}` }
        }
      );
    }
    case 'run': {
      const run = await one(subjectQueries.run, subject.id);
      return run && { run: { ...run, url: `${base}/runs/${run.number}` } };
    }
    case 'review': {
      const review = await one(subjectQueries.review, subject.id);
      return (
        review && {
          review: { state: review.state, body: review.body, author: review.author },
          pull: { number: review.number, title: review.title, url: `${base}/pulls/${review.number}` }
        }
      );
    }
    case 'comment': {
      const comment = await one(
        subject.on === 'issue' ? subjectQueries.issueComment : subjectQueries.pullComment,
        subject.id
      );
      const path = subject.on === 'issue' ? 'issues' : 'pulls';
      return (
        comment && {
          comment: { body: comment.body, author: comment.author },
          [subject.on]: { number: comment.number, title: comment.title, url: `${base}/${path}/${comment.number}` }
        }
      );
    }
  }
}

export async function emitRepositoryEvent(
  env: Env,
  repositoryId: string,
  event: WebhookEvent,
  action: string,
  subject: EventSubject,
  sender: string | null
) {
  try {
    const hooks = await env.DB.prepare(
      `SELECT webhooks.id,webhooks.events_json AS eventsJson FROM webhooks JOIN repositories ON repositories.organization_id=webhooks.organization_id WHERE repositories.id=?1 AND webhooks.active=1 AND (webhooks.repository_id=?1 OR webhooks.repository_id IS NULL)`
    )
      .bind(repositoryId)
      .all<Hook>();
    const subscribed = hooks.results.filter((hook) => (JSON.parse(hook.eventsJson) as string[]).includes(event));
    if (!subscribed.length) return;
    const repository = await env.DB.prepare(repositoryQuery)
      .bind(repositoryId)
      .first<{ id: string; owner: string; name: string; visibility: string }>();
    if (!repository) return;
    const base = `${env.PUBLIC_URL}/${repository.owner}/${repository.name}`;
    const data = await subjectData(env, repositoryId, base, subject);
    if (!data) return;
    const payload = JSON.stringify({
      event,
      action,
      repository: { owner: repository.owner, name: repository.name, visibility: repository.visibility, url: base },
      sender: sender ? { handle: sender, url: `${env.PUBLIC_URL}/${sender}` } : null,
      ...data
    });
    const deliveries = subscribed.map((hook) => ({ id: identifier('delivery'), hook: hook.id }));
    await env.DB.batch(
      deliveries.map((delivery) =>
        env.DB.prepare('INSERT INTO webhook_deliveries (id,webhook_id,event,action,payload) VALUES (?,?,?,?,?)').bind(
          delivery.id,
          delivery.hook,
          event,
          action,
          payload
        )
      )
    );
    await env.WEBHOOK_QUEUE.sendBatch(deliveries.map((delivery) => ({ body: { deliveryId: delivery.id } })));
  } catch (error) {
    console.error('Webhook event could not be queued', { repositoryId, event, error: String(error) });
  }
}
