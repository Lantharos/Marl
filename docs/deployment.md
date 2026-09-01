# Deployment

Marl deploys as three Cloudflare Workers and one persistent SSH origin:

- `marl-web` serves the SvelteKit application from `marl.sh`.
- `marl-api` owns `marl.sh/api/*` and `marl.sh/health`.
- `marl-git` serves Smart HTTP Git from `git.marl.sh`. Git authorization reaches the API through a
  private service binding. The API reaches Git's Custom Domain for repository operations, avoiding
  a circular first-deployment dependency between the two Workers.
- `git-ssh` serves standard Git over SSH from `ssh.marl.sh`. It keeps only a reusable local pack
  cache and a persistent host key; every fetch hydrates a specific canonical R2 generation and
  every push completes the same lease, validation, and publication protocol as HTTPS before it
  reports success.

Server-rendered web requests also reach the API through a service binding. Browser requests remain
same-origin on `marl.sh/api/*`; a Worker cannot target that same-zone route with a public `fetch`.

The checked configurations disable `workers.dev`. Production traffic therefore cannot
accidentally bypass the intended domains, cookies, or same-origin API route.

## Resources

The production D1 database is already bound in `apps/api/wrangler.jsonc`. Create both R2 buckets
before the first deployment:

```sh
bunx wrangler r2 bucket create marl-objects
bunx wrangler r2 bucket create marl-git-repositories
```

Configure the `marl-git-repositories` bucket with the retention lock described in
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

Provision the SSH origin on a host with a persistent public TCP address. Cloudflare Workers do not
accept inbound raw SSH connections, so `ssh.marl.sh` must be an unproxied A or AAAA record pointing
at that host. Generate one persistent host key and keep the gateway token outside the image:

```sh
install -d -m 700 secrets
ssh-keygen -q -t ed25519 -N '' -f secrets/ssh_host_ed25519_key
export MARL_SSH_HOST_KEY_FILE="$PWD/secrets/ssh_host_ed25519_key"
export MARL_GIT_GATEWAY_TOKEN='the same value configured on both Workers'
docker compose -f deploy/ssh/compose.yaml up -d --build
```

The named volume is a performance cache, not repository authority. It can be replaced without
losing a published repository. The host key must remain stable so clients do not receive host-key
change warnings. Restrict TCP port 22 to Git clients and do not expose the container's HTTP port.

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

Deploy the API first because both other Workers have service bindings to it. Deploy Git next so
the SSH origin can hydrate and publish canonical generations, then start SSH and deploy the web:

```sh
bun run --cwd apps/git-edge build:container
bunx wrangler deploy --config apps/api/wrangler.jsonc
bunx wrangler deploy --config apps/git-edge/wrangler.jsonc
docker compose -f deploy/ssh/compose.yaml up -d --build
bun run --cwd apps/web deploy
```

After deployment, verify the web origin, `/health`, password and passkey sign-in, a clone and
push through both `git.marl.sh` and `ssh.marl.sh`, cross-protocol fetch visibility, release
publication, release asset download, repository browsing, and a self-hosted runner job. The local
qualification command does not exercise live Cloudflare R2, Durable Objects, Containers, DNS,
email, or retention settings.
