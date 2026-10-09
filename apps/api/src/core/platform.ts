export type D1PreparedStatement = ReturnType<CloudflareBindings['DB']['prepare']>;
export type D1Result<T = Record<string, unknown>> = Awaited<ReturnType<D1PreparedStatement['all']>> & { results: T[] };

export type Env = CloudflareBindings;
