# sty

`sty` is the official hosted collaboration layer for PIG. PIG is the local VCS engine; sty owns identity, project hosting, a reference PIG remote API, and the browser dashboard.

The backend is a Cloudflare Worker in `server`. It uses D1 for project metadata, workspace heads, issues, history, settings, and protocol records, and R2 for immutable object bytes.

E2EE and CI are intentionally deferred.

## Project Layout

- `client` is the `sty` CLI.
- `server` is the Cloudflare Worker backend.
- `frontend` is the SvelteKit dashboard.
- `crates/sty-protocol` contains shared request/response types.

## Requirements

- Rust with the `wasm32-unknown-unknown` target for the Worker:

```powershell
rustup target add wasm32-unknown-unknown
```

- Bun for frontend and Wrangler commands.
- Wrangler, run with `bunx wrangler ...`.
- `worker-build` for the Rust Worker build step:

```powershell
cargo install worker-build
```

## Build The CLI

Build the Rust workspace from the repo root:

```powershell
cargo build
```

The `sty` binary will be in Cargo's debug output, usually `target/debug/sty` on macOS/Linux or `target\debug\sty.exe` on Windows. You can either reference that binary directly:

```powershell
target\debug\sty.exe whoami
```

or add the debug output directory to your `PATH` while developing so `sty` works like a normal command.

## Run The Worker Locally

From `server`, apply the D1 schema before using the API. Use local migrations for `wrangler dev`:

```powershell
cd server
bunx wrangler d1 migrations apply sty-db --local
```

Then start the Worker:

```powershell
bunx wrangler dev
```

By default, Wrangler serves the Worker at `http://127.0.0.1:8787`. The frontend also defaults to that API base. Set `PUBLIC_STY_API_BASE` only when pointing the frontend at a different backend.

For remote Cloudflare resources, apply the same schema remotely before deploying or testing against remote bindings:

```powershell
cd server
bunx wrangler d1 migrations apply sty-db --remote
```

Then validate or deploy:

```powershell
bunx wrangler deploy --dry-run
bunx wrangler deploy
```

Make sure the configured D1 database and R2 bucket in `server/wrangler.jsonc` exist for the environment you are using.

Optional Worker settings:

- `STY_ALLOWED_ORIGINS` is a comma-separated list of frontend origins allowed by CORS.
- `STY_FRONTEND_ORIGIN` is the browser origin used for OAuth callbacks and remote approval links. The local default is `http://127.0.0.1:5173`.
- `STY_TOKEN_TTL_SECONDS` controls sty bearer token lifetime. The default is 30 days.
- `STY_MAX_OBJECT_BYTES` controls the maximum raw object upload size. The default is 64 MiB.

## Run The Frontend

From `frontend`:

```powershell
bun install
bun run dev
```

The dashboard uses Ave OAuth. The callback route is:

```text
http://localhost:5173/auth/callback
```

If you use a different frontend origin, register that matching `/auth/callback` URL with the Ave app and set `PUBLIC_AVE_CLIENT_ID` if you are not using the default sty client id.

## Normal User Flow

Start the Worker, then sign in with the CLI:

```powershell
sty login
sty init tenant/project
pig sync
```

Your account tenant is created automatically from your Ave handle. To create an organization tenant first:

```powershell
sty tenant new tenant
sty init tenant/project
```

`sty login` opens Ave, completes the OAuth callback locally, exchanges the Ave ID token with the sty Worker, and imports the returned sty bearer token into PIG. `sty init tenant/project` creates or connects the project and configures the PIG remote for the current repo.

After that, use PIG normally:

```powershell
pig save "describe the work"
pig work new feature-name
pig work ready
pig sync
```

## Protocol Features

The Worker exposes `/v1/capabilities` and advertises the implemented PIG protocol features:

- issues, comments, labels, and milestones
- ready queues and workspace merge metadata
- hooks and webhooks
- search
- stars and project settings
- releases and tags
- signed snapshot verification with user-scoped signing keys
- profiles and account signing keys

Protocol list endpoints return the standard pagination envelope:

```json
{
  "items": [],
  "page": 1,
  "per_page": 25,
  "total": 0,
  "total_pages": 1,
  "next": null,
  "prev": null
}
```

## Verification

Rust workspace:

```powershell
cargo check
```

Worker:

```powershell
cd server
cargo check
bunx wrangler deploy --dry-run
```

Frontend:

```powershell
cd frontend
bun run check
bun run build
```

Use `bunx wrangler dev` for the backend during local browser testing.
