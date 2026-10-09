import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

type Organization = { slug: string; name: string };
type DeletionPreview = { blockers: Organization[]; teamOrganizations: Organization[]; repositoryCount: number };

export const load = (({ fetch }) => routeLoad(apiWith<DeletionPreview>(fetch, '/account/deletion'))) satisfies PageLoad;
