import type { SshKey } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (({ fetch }) => routeLoad(apiWith<{ sshKeys: SshKey[] }>(fetch, '/ssh-keys'))) satisfies PageLoad;
