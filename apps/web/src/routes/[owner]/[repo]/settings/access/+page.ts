import type { IdentityKind, SigningMode } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export type AccessPerson = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  kind?: IdentityKind;
  role?: string;
};
export type AccessTeam = { id: string; name: string; slug: string; role?: string; members?: number };

type Access = {
  repository: { id: string; owner: string; name: string };
  signingMode: SigningMode;
  requireCheckApproval: boolean;
  collaborators: AccessPerson[];
  teams: AccessTeam[];
  availableTeams: AccessTeam[];
};

export const load = (({ fetch, params }) =>
  routeLoad(apiWith<Access>(fetch, `/repositories/${params.owner}/${params.repo}/access`))) satisfies PageLoad;
