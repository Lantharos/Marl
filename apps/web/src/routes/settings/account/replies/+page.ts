import type { SavedReply } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ replies: SavedReply[] }>(fetch, '/saved-replies'))) satisfies PageLoad;
