import type { Container } from '@cloudflare/containers';

type GeneratedBindings = Omit<CloudflareBindings, 'GIT_CONTAINERS' | 'VALIDATOR_CONTAINERS' | 'MAINTENANCE_CONTAINERS'>;

export type GitEdgeEnv = GeneratedBindings & {
  GIT_CONTAINERS: DurableObjectNamespace<Container<GitEdgeEnv>>;
  VALIDATOR_CONTAINERS: DurableObjectNamespace<Container<GitEdgeEnv>>;
  MAINTENANCE_CONTAINERS: DurableObjectNamespace<Container<GitEdgeEnv>>;
};
