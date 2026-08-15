import type { Container } from '@cloudflare/containers';

export interface GitEdgeEnv {
  GIT_CONTAINERS: DurableObjectNamespace<Container<GitEdgeEnv>>;
  VALIDATOR_CONTAINERS: DurableObjectNamespace<Container<GitEdgeEnv>>;
  MAINTENANCE_CONTAINERS: DurableObjectNamespace<Container<GitEdgeEnv>>;
  REPOSITORY_STATE: DurableObjectNamespace;
  ORGANIZATION_QUOTAS: DurableObjectNamespace;
  UPLOAD_SESSIONS: DurableObjectNamespace;
  COMPACTIONS: DurableObjectNamespace;
  INDEXING: DurableObjectNamespace;
  REPOSITORIES: R2Bucket;
  STY_API_URL: string;
  STY_GIT_GATEWAY_TOKEN: string;
}
