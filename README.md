# sty

sty is the hosted collaboration layer for PIG projects: identity, projects, permissions, review, releases, CI, and the browser dashboard.

## Install

```sh
curl -fsSL https://sty.sh/install.sh | sh
```

Windows:

```powershell
irm https://sty.sh/install.ps1 | iex
```

Binaries are served from the `lantharos/pig` project releases on sty:

- `https://sty.sh/lantharos/pig/releases/latest/sty-darwin-arm64.tar.gz`
- `https://sty.sh/lantharos/pig/releases/latest/sty-linux-x64.tar.gz`
- `https://sty.sh/lantharos/pig/releases/latest/sty-windows-x64.zip`

## Quick start

```sh
sty login
sty init my-tenant/my-project
pig save -m "initial work"
pig sync my-tenant/my-project
```

Use a local API while developing:

```sh
sty login --port 8787
```

## API

Production API base: `https://sty.sh/api`

Examples:

- `GET https://sty.sh/api/v1/me`
- `GET https://sty.sh/api/v1/tenants/:tenant/projects/:project/releases`

Public release downloads use the site origin, not `/api`:

- `GET https://sty.sh/:tenant/:project/releases/latest/:filename`

## Docs

The full docs site lives in the frontend under `/docs`:

- `/docs/sty` — hosted product model
- `/docs/sty/cli` — sty CLI reference
- `/docs/sty/development` — run Worker, frontend, and CLIs from source
- `/docs/api` and `/docs/protocol` — integrations

## Development

```sh
cd frontend
bun install
bun run dev
```

```sh
cd server
bunx wrangler d1 migrations apply sty --local
bunx wrangler dev
```

```sh
cargo build
cargo test
```

Local defaults:

- frontend: `http://localhost:5173`
- API worker: `http://127.0.0.1:8787/api`
- set `PUBLIC_STY_API_BASE=http://127.0.0.1:8787/api` when running the frontend against a local worker

## Deploy

Production uses two Cloudflare Workers on `sty.sh`:

- `sty-server` at `sty.sh/api/*`
- `sty-frontend` at `sty.sh/*`

Prerequisites in your Cloudflare account:

- D1 database `sty` (`1ebc4e0e-5d2a-41f5-81d9-121dc68311d0`)
- R2 bucket `sty-objects`
- Queues `sty-webhooks`, `sty-webhooks-dlq`, `sty-ci`, `sty-ci-dlq`

```sh
cd server
bunx wrangler d1 migrations apply sty --remote
bunx wrangler deploy

cd ../frontend
bun run deploy
```

Set `CLOUDFLARE_API_TOKEN` locally or use GitHub Actions (`.github/workflows/deploy.yml`).

OAuth uses Ave (`AVE_ISSUER`, `AVE_CLIENT_ID` in `server/wrangler.jsonc`). No server-side OAuth secret is required for the browser PKCE flow.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
