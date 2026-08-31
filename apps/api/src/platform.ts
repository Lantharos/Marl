export type D1PreparedStatement = ReturnType<CloudflareBindings['DB']['prepare']>;
export type D1Result<T = Record<string, unknown>> = Awaited<ReturnType<D1PreparedStatement['all']>> & { results: T[] };

export interface Env extends CloudflareBindings {
  GIT_GATEWAY_URL?: string;
  GIT_SSH_PUBLIC_URL?: string;
}
