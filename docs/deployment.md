# Deployment

Marl deploys as three Cloudflare Workers:

- `marl-web` serves the SvelteKit application from `marl.sh`.
- `marl-api` owns `marl.sh/api/*` and `marl.sh/health`.
- `marl-git` serves Smart HTTP Git from `git.marl.sh`. Git authorization reaches the API through a
  private service binding. The API reaches Git's Custom Domain for repository operations, avoiding
  a circular first-deployment dependency between the two Workers.

Server-rendered web requests also reach the API through a service binding. Browser requests remain
same-origin on `marl.sh/api/*`; a Worker cannot target that same-zone route with a public `fetch`.

The checked configurations disable `workers.dev`. Production traffic therefore cannot
accidentally bypass the intended domains, cookies, or same-origin API route.

## Resources

Create the D1 database and both R2 buckets before the first deployment:

```sh
bunx wrangler d1 create marl
bunx wrangler r2 bucket create marl-objects
bunx wrangler r2 bucket create marl-git-repositories
```

Copy the returned D1 identifier into `apps/api/wrangler.jsonc`. Configure the
`marl-git-repositories` bucket with the retention lock described in
[`repository-reliability.md`](repository-reliability.md), and enable D1 Time Travel before
accepting production writes.

Set API secrets without placing their values in source control:

```sh
bunx wrangler secret put AUTH_SECRET --config apps/api/wrangler.jsonc
bunx wrangler secret put SECRET_ENCRYPTION_KEY --config apps/api/wrangler.jsonc
bunx wrangler secret put GIT_GATEWAY_TOKEN --config apps/api/wrangler.jsonc
bunx wrangler secret put MARL_GIT_GATEWAY_TOKEN --config apps/git-edge/wrangler.jsonc
```

`GIT_GATEWAY_TOKEN` and `MARL_GIT_GATEWAY_TOKEN` must contain the same independently generated
value. `AUTH_SECRET` needs at least 32 random bytes. `SECRET_ENCRYPTION_KEY` must be exactly 32
random bytes encoded as base64. Wrangler declares these names as required bindings, so local
development warns when one is missing and production deployment fails before publishing an
incomplete Worker.

Cloudflare Email Sending must be active for `marl.sh`; the API binding is restricted to
`noreply@marl.sh`. Before deploying the API route, `marl.sh` must have a proxied DNS record. Use an
originless `AAAA` record pointing to `100::` if the web Custom Domain has not created the record
yet. DNS for the zone must be active before Wrangler creates the web and Git custom domains.

## Release order

Qualify the source and apply the squashed schema:

```sh
bun ci
bun check
bun run build
bun run test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
bunx wrangler d1 migrations apply marl --remote --config apps/api/wrangler.jsonc
```

Deploy the API first because both other Workers have service bindings to it. Deploy Git and the web
app after the API service exists:

```sh
bun run --cwd apps/git-edge build:container
bunx wrangler deploy --config apps/api/wrangler.jsonc
bunx wrangler deploy --config apps/git-edge/wrangler.jsonc
bun run --cwd apps/web deploy
```

The current canonical production Git path is HTTPS through `marl-git`. Do not set
`GIT_SSH_PUBLIC_URL` in production until the persistent SSH origin publishes into the same R2
generation model; advertising a separate writable repository would split repository state.

After deployment, verify the web origin, `/health`, password and passkey sign-in, a clone and
push through `git.marl.sh`, repository browsing, and a self-hosted runner job. The local
qualification command does not exercise live R2, Durable Objects, Containers, DNS, email, or
retention settings.
