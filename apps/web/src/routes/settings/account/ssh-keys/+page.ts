import type { SshKey } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch }) => routeLoad(apiWith<{ sshKeys: SshKey[] }>(fetch, '/ssh-keys'))) satisfies PageLoad;
