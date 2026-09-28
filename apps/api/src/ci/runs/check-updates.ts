import type { Env } from '../../core/platform';
import { mergeQueueChecksChanged } from '../../pulls/queue/processor';
import { notifyPullsForCommit } from '../../pulls/realtime/updates';

export async function checksChanged(env: Env, repositoryId: string, commitId: string) {
  await Promise.all([
    notifyPullsForCommit(env, repositoryId, commitId),
    mergeQueueChecksChanged(env, repositoryId, commitId)
  ]);
}
