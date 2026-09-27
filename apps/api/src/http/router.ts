import type { Principal } from '../auth/principal';
import type { Runner } from '../ci/runners/runners';
import type { Env } from '../core/platform';

export type Access = 'public' | 'gateway' | 'runner' | 'optional' | 'user';
type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestContext {
  request: Request;
  env: Env;
  url: URL;
  execution: ExecutionContext;
  principal: Principal | null;
  runner: Runner | null;
  gatewayTrusted: boolean;
}

type Params = Record<string, string>;
type Guarded<TAccess extends Access> = TAccess extends 'user'
  ? RequestContext & { principal: Principal }
  : TAccess extends 'runner'
    ? RequestContext & { runner: Runner }
    : RequestContext;
type Handler<TAccess extends Access> = (context: Guarded<TAccess>, params: Params) => Promise<Response> | Response;

export interface Route {
  methods: Method[];
  access: Access;
  pattern: RegExp;
  names: string[];
  handler: Handler<Access>;
}

export function route<TAccess extends Access>(
  method: Method | Method[],
  path: string,
  access: TAccess,
  handler: Handler<TAccess>
): Route {
  const names: string[] = [];
  const source = path.replace(
    /\*(\w+)|:(\w+)(?:\(([^)]+)\))?/g,
    (_, rest: string, name: string, constraint: string) => {
      names.push(rest ?? name);
      return rest ? '(.+)' : `(${constraint ?? '[^/]+'})`;
    }
  );
  return {
    methods: Array.isArray(method) ? method : [method],
    access,
    pattern: new RegExp(`^/api/v1${source}$`),
    names,
    handler: handler as Handler<Access>
  };
}

export type RouteMatch = { route: Route; params: Params } | { allow: Method[] } | null;

export function matchRoute(routes: Route[], method: string, pathname: string): RouteMatch {
  const allow = new Set<Method>();
  for (const candidate of routes) {
    const match = candidate.pattern.exec(pathname);
    if (!match) continue;
    if (!candidate.methods.includes(method as Method)) {
      candidate.methods.forEach((value) => allow.add(value));
      continue;
    }
    const params: Params = {};
    candidate.names.forEach((name, index) => (params[name] = decodeURIComponent(match[index + 1])));
    return { route: candidate, params };
  }
  return allow.size ? { allow: [...allow] } : null;
}
