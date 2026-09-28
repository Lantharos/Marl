import { join } from 'node:path';
import { assert } from '../client';
import type { Qualification } from '../environment';
import {
  assertRevisionHistory,
  commitMarker,
  head,
  stage,
  timelineEvents,
  type PullQualificationDetail,
  type QualifiedRepository
} from '../helpers';
import { run } from '../process';

async function qualifyTimeline(qualification: Qualification, repository: QualifiedRepository) {
  const { client, paths } = qualification;
  const source = paths.source;
  stage('Exercise pull request synchronization and timeline history');
  await client.git(['fetch', 'origin', 'main'], repository.token);
  await run(['git', 'switch', '-C', 'qualification/timeline', 'origin/main'], { cwd: source });
  await commitMarker(qualification, 'timeline first commit');
  await commitMarker(qualification, 'timeline second commit');
  const second = await head(source);
  await client.git(['push', '--set-upstream', 'origin', 'qualification/timeline'], repository.token);
  const created = await client.request<{ pullRequest: { number: number } }>(`${repository.path}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Qualify pull synchronization',
      body: 'Exercises lifecycle, commit history, and rewritten heads.',
      sourceBranch: 'qualification/timeline',
      targetBranch: 'main',
      draft: true
    })
  });
  const pull = `${repository.path}/pulls/${created.pullRequest.number}`;
  await client.request(`${pull}/ready`, { method: 'POST' });
  await client.request(`${pull}/close`, { method: 'POST' });
  await client.request(`${pull}/reopen`, { method: 'POST' });
  await client.request(`${pull}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: 'Timeline synchronization review.' })
  });
  await client.request(`${pull}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ state: 'commented', commitId: second, body: 'Current head reviewed.' })
  });
  const initial = await client.request<PullQualificationDetail>(pull);
  assert(initial.pullRequest.state === 'mergeable', 'Reopened pull request was not mergeable.');
  const events = timelineEvents(initial);
  assert(
    events.includes('ready') && events.includes('closed') && events.includes('reopened'),
    'Pull request lifecycle events are incomplete.'
  );
  assertRevisionHistory(initial, [second]);

  await commitMarker(qualification, 'timeline fast-forward commit');
  const fastForward = await head(source);
  await client.git(['push', 'origin', 'qualification/timeline'], repository.token);
  const fastForwarded = await client.waitFor(
    () => client.request<PullQualificationDetail>(pull),
    (value) => value.pullRequest.sourceCommitId === fastForward,
    'Pull request did not synchronize a fast-forward push'
  );
  assertRevisionHistory(fastForwarded, [second, fastForward]);
  assert(
    !fastForwarded.pullRequest.timeline.revisions.at(-1)?.forcePushed,
    'A fast-forward push was recorded as a force push.'
  );

  await run(['git', 'reset', '--hard', 'origin/main'], { cwd: source });
  await commitMarker(qualification, 'timeline rewritten commit');
  const rewritten = await head(source);
  await client.git(['push', '--force-with-lease', 'origin', 'qualification/timeline'], repository.token);
  const rewrittenDetail = await client.waitFor(
    () => client.request<PullQualificationDetail>(pull),
    (value) =>
      value.pullRequest.sourceCommitId === rewritten &&
      value.pullRequest.timeline.revisions.at(-1)?.forcePushed === true,
    'Pull request did not preserve a force-push revision boundary'
  );
  assertRevisionHistory(rewrittenDetail, [second, rewritten]);
  assert(
    rewrittenDetail.pullRequest.commits.length === 1 && rewrittenDetail.pullRequest.commits[0]?.id === rewritten,
    'Current pull request commits did not follow the rewritten head.'
  );
  const diff = await client.request<{ files: unknown[] }>(`${pull}/diff`);
  assert(diff.files.length > 0, 'Pull request diff was empty after a force push.');
  await client.request(`${pull}/merge`, {
    method: 'POST',
    body: JSON.stringify({
      method: 'merge',
      commitId: (await client.request<PullQualificationDetail>(pull)).pullRequest.sourceCommitId
    })
  });
}

async function qualifyPublication(qualification: Qualification, repository: QualifiedRepository) {
  const { client, paths } = qualification;
  const source = paths.source;
  stage('Exercise pull request publication');
  for (const method of ['merge', 'squash', 'rebase'] as const) {
    await client.git(['fetch', 'origin', 'main'], repository.token);
    await run(['git', 'switch', '-C', `qualification/${method}`, 'origin/main'], { cwd: source });
    await Bun.write(join(source, `qualification-${method}.txt`), `${method}\n`);
    await run(['git', 'add', `qualification-${method}.txt`], { cwd: source });
    await run(['git', 'commit', '-m', `Qualify ${method} pull request`], { cwd: source });
    await client.git(['push', '--set-upstream', 'origin', `qualification/${method}`], repository.token);
    const created = await client.request<{ pullRequest: { number: number } }>(`${repository.path}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Qualify ${method} publication`,
        body: `Exercises the ${method} path.`,
        sourceBranch: `qualification/${method}`,
        targetBranch: 'main'
      })
    });
    const pull = `${repository.path}/pulls/${created.pullRequest.number}`;
    await client.request(`${pull}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Ready to exercise **${method}** publication.` })
    });
    const reviewed = await head(source);
    const merge = () =>
      client.request<{ commitId: string }>(`${pull}/merge`, {
        method: 'POST',
        body: JSON.stringify({ method, commitId: reviewed })
      });
    const merged = await merge();
    const retried = await merge();
    assert(merged.commitId === retried.commitId, `${method} merge retry produced a different commit.`);
    const detail = await client.request<PullQualificationDetail>(pull);
    assert(
      detail.pullRequest.timeline.items.some((item) => item.kind === 'event' && item.value.kind === 'merged'),
      `${method} merge was not recorded in the timeline.`
    );
  }
}

export async function qualifyPulls(qualification: Qualification, repository: QualifiedRepository) {
  await qualifyTimeline(qualification, repository);
  await qualifyPublication(qualification, repository);
}
