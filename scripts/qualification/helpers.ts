import { join } from 'node:path';
import { assert, type MarlClient } from './client';
import type { Qualification } from './environment';
import { run } from './process';

export type RunSummary = {
  number: number;
  state: string;
  trigger: string;
  branch: string;
  commit: string;
  cancellationReason?: string;
};

export type PullQualificationDetail = {
  pullRequest: {
    state: string;
    sourceCommitId: string;
    realtimeVersion: number;
    commits: Array<{ id: string }>;
    timeline: {
      items: Array<{ kind: string; value: { kind?: string } }>;
      revisions: Array<{ commitId: string; forcePushed: boolean }>;
    };
  };
};

export type QualifiedRepository = { name: string; token: string; remote: string; path: string };

export function stage(label: string) {
  console.log(`\n\x1b[38;2;238;117;83m●\x1b[0m ${label}`);
}

export async function head(source: string) {
  return (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
}

export async function commitMarker(qualification: Qualification, message: string) {
  const source = qualification.paths.source;
  const marker = join(source, 'qualification-state.txt');
  const previous = await Bun.file(marker)
    .text()
    .catch(() => '');
  await Bun.write(marker, `${previous}${message}\n`);
  await run(['git', 'add', 'qualification-state.txt'], { cwd: source });
  await run(['git', 'commit', '-m', message], { cwd: source });
}

export function assertRevisionHistory(detail: PullQualificationDetail, expected: string[]) {
  const recorded = detail.pullRequest.timeline.revisions.map((revision) => revision.commitId);
  assert(
    recorded.length === expected.length && expected.every((commit, index) => recorded[index] === commit),
    'Pull request revision history is incomplete.'
  );
}

export function timelineEvents(detail: PullQualificationDetail) {
  return detail.pullRequest.timeline.items.flatMap((item) =>
    item.kind === 'event' && item.value.kind ? [item.value.kind] : []
  );
}

export async function readAllLogs(client: MarlClient, jobId: string) {
  let cursor = -1;
  let logs = '';
  for (;;) {
    const response = await client.response(`/api/v1/jobs/${jobId}/logs?after=${cursor}`);
    assert(response.ok, `Persisted logs could not be read (${response.status}).`);
    logs += await response.text();
    cursor = Number(response.headers.get('x-marl-log-cursor') ?? cursor);
    if (response.headers.get('x-marl-log-more') !== 'true') return logs;
  }
}

export function workflowFile() {
  return `name: Qualification
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  verify:
    labels: [docker]
    runtime:
      image: alpine:3.22
      timeoutMinutes: 10
    steps:
      - name: Verify checkout
        shell: sh
        run: test -f README.md && test -n "$QUALIFICATION_SECRET" && printf '%s\\n' "$QUALIFICATION_SECRET" && mkdir -p qualification && printf 'passed\\n' > qualification/result.txt
    artifacts: [qualification/result.txt]
`;
}
