import type { RunDetail } from '@marl/contracts';
import { apiTextCursorWith, apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const detail = await routeLoad(apiWith<{ run: RunDetail }>(fetch, `/repositories/${params.owner}/${params.repo}/runs/${params.number}`));
  const firstJob = detail.run.jobsDetail[0];
  const log = firstJob ? await apiTextCursorWith(fetch, `/jobs/${firstJob.id}/logs`) : { text: '', cursor: -1, more: false };
  return { run: detail.run, selected: firstJob?.id ?? '', logs: log.text, logCursor: log.cursor };
};
