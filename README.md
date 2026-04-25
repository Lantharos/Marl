# sty

`sty` is the hosted and local collaboration layer for PIG. PIG remains the local VCS engine; sty owns identity, project hosting, the PIG remote server, and the user-facing client.

## Layout

- `client` is the `sty` CLI. It handles login, project setup, and PIG handoff.
- `server/local` is the local Axum remote server used for development and smoke tests.
- `server/worker` is the Cloudflare Worker backend. It uses R2 for immutable object bytes and a Durable Object per `tenant/project` for workspace heads, snapshot ancestry, compare, and CAS.
- `frontend` is the SvelteKit project dashboard. It uses AveSession from `@ave-id/sdk`.
- `crates/sty-protocol` contains the shared PIG remote request/response types.

## Local Development

Build the Rust workspace:

```powershell
cargo build
```

Start the local remote:

```powershell
cargo run -p sty-local-server -- --data .sty-data --bind 127.0.0.1:7379
```

In another shell, log in and connect a repo:

```powershell
cargo run -p sty -- login --dev --remote-url http://127.0.0.1:7379 --pig E:\Desktop\pig\target\debug\pig.exe
cargo run -p sty -- whoami
cargo run -p sty -- init dev/demo --remote-url http://127.0.0.1:7379 --pig E:\Desktop\pig\target\debug\pig.exe
cargo run -p sty -- project list --remote-url http://127.0.0.1:7379
pig sync
```

To test the browser OAuth shape locally, register an Ave OAuth app with this redirect URI:

```text
http://127.0.0.1:7390/callback
```

Then start the local server and run:

```powershell
cargo run -p sty -- login --remote-url http://127.0.0.1:7379 --pig E:\Desktop\pig\target\debug\pig.exe
```

`sty login` opens Ave, receives the localhost callback, completes the PKCE token exchange, sends the Ave `id_token` to sty, and imports the returned sty bearer token into PIG.

Frontend:

```powershell
cd frontend
bun run dev
```

Set `PUBLIC_STY_API_BASE` when the frontend should talk to a non-default sty server. The Ave OAuth client id is public and defaults to `app_813ac5533bb87d939f328d76b5a1dca8`; `PUBLIC_AVE_CLIENT_ID` is only needed for testing a different Ave app.

In Svelte dev mode the dashboard also shows a dev-server sign-in. It calls `/v1/dev/tokens`, stores the returned sty bearer token locally, and can create/list projects against the configured API base. For a production-style frontend build that still targets a local dev backend, set:

```powershell
$env:PUBLIC_STY_DEV_AUTH="true"
```

To point that dev sign-in at Wrangler's local Worker on port `8787`, use:

```powershell
$env:PUBLIC_STY_DEV_AUTH="worker"
```

## Auth

The frontend uses AveSession:

- `AveSession` persists and refreshes the browser session.
- `/auth/callback` calls `completeOAuthCallback`.
- The frontend or CLI sends a fresh Ave `id_token` to `POST /v1/session/exchange`.
- The local server and Cloudflare Worker verify that token through Ave OIDC discovery and JWKS against the default sty Ave client id. `STY_AVE_CLIENT_ID` or `AVE_CLIENT_ID` can override it for alternate dev apps.
- The server returns a sty bearer token accepted by PIG remote endpoints.
- The CLI imports the sty bearer token into PIG with `pig auth import <remote-url> --token-stdin`.

Local dev also supports `sty login --dev`, which requests a random dev token from `server/local` and imports it into PIG. Tokens are stored server-side by hash. A dev token can create projects only in its own tenant, so `sty login --dev --user dev` can create `dev/demo` but not `other/demo`.

Useful CLI checks:

```powershell
sty whoami
sty project list
```

## Hosted Server

The Worker backend is in `server/worker`:

```powershell
cargo check --manifest-path server\worker\Cargo.toml --target wasm32-unknown-unknown
cd server\worker
wrangler deploy --dry-run
```

Before deploying, create or bind the `sty-objects` R2 bucket. The Worker uses the public sty Ave client id from `wrangler.jsonc` by default and validates Ave id tokens with OIDC discovery and JWKS. Hosted dev-token minting is disabled unless `STY_DEV_TOKENS=true` is set for an explicit development environment.

## Verification

Run the Rust tests:

```powershell
cargo test --workspace
```

Run the real PIG smoke test:

```powershell
.\scripts\smoke-pig.ps1
```

Run the same PIG smoke through Wrangler's local Worker, R2, and Durable Object simulation:

```powershell
.\scripts\smoke-worker.ps1
```

The smoke test saves, syncs, and pulls both a small text file and a large binary file so the normal JSON upload path and chunked object upload path are both exercised.

Check the frontend:

```powershell
cd frontend
bun run check
bun run build
```

Known PIG v1 limitation: `pig sync` compares before uploading a new local snapshot, so the server cannot prove ancestry for local heads it has never seen. sty returns `local_ahead` for unknown local heads to preserve normal push behavior; uploaded snapshots use real parent ancestry for `same`, `local_ahead`, `remote_ahead`, and `diverged`.
