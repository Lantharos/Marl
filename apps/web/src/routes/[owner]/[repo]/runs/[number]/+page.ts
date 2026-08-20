import type { RunDetail } from '@marl/contracts';
import { apiTextCursorWith, apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const detail = await routeLoad(apiWith<{ run: RunDetail }>(fetch, `/repositories/${params.owner}/${params.repo}/runs/${params.number}`));
  const firstJob = detail.run.jobsDetail[0];
  if (!firstJob) return { run: detail.run, selected: '', logs: '', logCursor: -1, logUnavailable: false };
  try {
    const log = await apiTextCursorWith(fetch, `/jobs/${firstJob.id}/logs`);
    return { run: detail.run, selected: firstJob.id, logs: log.text, logCursor: log.cursor, logUnavailable: false };
  } catch {
    return { run: detail.run, selected: firstJob.id, logs: '', logCursor: -1, logUnavailable: true };
  }
};
