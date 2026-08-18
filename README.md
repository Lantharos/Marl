# Sty

Sty is a focused code-hosting platform for repositories, pull requests, and self-hosted CI.

This repository is undergoing a ground-up rebuild. The current product contract lives in
[`docs/product.md`](docs/product.md), and the implementation boundaries live in
[`docs/architecture.md`](docs/architecture.md).

Runner registration, repository workflows, service installation, labels, logs, and
artifacts are documented in [`docs/runners.md`](docs/runners.md).
The repository acknowledgement and recovery contract is documented in
[`docs/repository-reliability.md`](docs/repository-reliability.md).

## Development

Install JavaScript dependencies once:

```powershell
bun install
```

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and replace `AUTH_SECRET` before
creating an account. Ave credentials are optional; local password and passkey sign-in work without
them.

Production authentication email is sent directly through Cloudflare Email Service. Onboard
`sty.sh` for Email Sending and keep the `EMAIL` binding restricted to `noreply@sty.sh`.

Start the web application, API, and local Git gateway together:

```powershell
bun dev
```

Sty uses a dedicated local port range so it can run alongside other projects:

- web: `http://127.0.0.1:42617`
- API: `http://127.0.0.1:42618`
- Git: `http://127.0.0.1:42619`
- Worker inspector: `42620`

The development supervisor owns every service process tree. Pressing Ctrl+C stops Vite,
Wrangler, the Rust Git gateway, and their descendants together. If one service fails, the
others are stopped as well so a partial Sty stack is not left running.

Or run a surface independently:

```powershell
bun dev:web
bun dev:api
bun dev:git
```

Production Git hosting is packaged by `apps/git-edge` and `Dockerfile.git` as a Cloudflare
Worker backed by immutable Git packs in R2, repository and organization Durable Objects,
and short-lived Containers for Git compatibility, validation, indexing, and compaction.
The local Rust gateway replaces those Containers during development, including on Windows.
To exercise the complete Cloudflare Worker and Container topology, run
`bun run --cwd apps/git-edge dev:cloudflare` from WSL or Linux; Wrangler does not support
local Container development directly on Windows.

The normal workspace build validates the Worker bundle without requiring Docker. Before a
Git deployment, run `bun run --cwd apps/git-edge build:container` with Docker Engine running
to build and validate the container image as well.

Before considering a milestone complete:

```powershell
bun check
bun run build
bun test
cargo clippy --workspace --all-targets -- -D warnings
```

Run the isolated dogfood qualification after Docker Engine is available:

```powershell
bun qualify
```

Qualification uses random loopback ports and temporary D1, R2, runner, and repository
directories. It pushes Sty's real Git history, verifies workflow supersession and Docker
execution, exercises every pull-request merge method and idempotent retry, restarts the local
services, and checks a fresh clone with `git fsck --strict`. Its services, containers, networks,
and temporary storage are removed whether the run succeeds or fails. The command validates the
local compatibility topology; the Worker, R2, Durable Object, and Container release gate remains
a separate Linux or WSL staging requirement.

## Product boundary

Sty has four primary product surfaces:

- Home: work that needs attention.
- Code: repositories, files, branches, and history.
- Pull requests: review, checks, and merging.
- Runs: self-hosted CI jobs, live logs, and artifacts.

Features outside that loop are intentionally deferred.
