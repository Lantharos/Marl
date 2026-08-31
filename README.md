# Marl

Marl is a focused code-hosting platform for repositories, issues, pull requests, and self-hosted CI.

This repository is undergoing a ground-up rebuild. The current product contract lives in
[`docs/product.md`](docs/product.md), and the implementation boundaries live in
[`docs/architecture.md`](docs/architecture.md).

Runner registration, repository workflows, service installation, labels, logs, and
artifacts are documented in [`docs/runners.md`](docs/runners.md).
The repository acknowledgement and recovery contract is documented in
[`docs/repository-reliability.md`](docs/repository-reliability.md).
SSH key authentication and the production TCP topology are documented in
[`docs/ssh.md`](docs/ssh.md).

## Development

Install JavaScript dependencies once:

```powershell
bun install
```

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and replace `AUTH_SECRET` and
`SECRET_ENCRYPTION_KEY` before creating an account. Marl supports password and passkey sign-in.

Generate the 32-byte encryption key with
`bun -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"`.

Production authentication email is sent directly through Cloudflare Email Service. Onboard
`marl.sh` for Email Sending and keep the `EMAIL` binding restricted to `noreply@marl.sh`.

Start the web application, API, and local Git gateway together:

```powershell
bun dev
```

Marl uses a dedicated local port range so it can run alongside other projects:

- web: `http://127.0.0.1:42617`
- API: `http://127.0.0.1:42618`
- Git: `http://127.0.0.1:42619`
- Worker inspector: `42620`
- SSH Git: `ssh://git@127.0.0.1:42621`

The development supervisor owns every service process tree. Pressing Ctrl+C stops Vite,
Wrangler, the Rust Git gateway, and their descendants together. If one service fails, the
others are stopped as well so a partial Marl stack is not left running.

Or run a smaller surface:

```powershell
bun dev:web
bun dev:api
bun dev:git
```

`bun dev:api` also starts and waits for the Git gateway because repository API routes depend on it.

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
directories. It pushes Marl's real Git history, verifies workflow supersession and Docker
execution, exercises every pull-request merge method and idempotent retry, restarts the local
services, and checks a fresh clone with `git fsck --strict`. Its services, containers, networks,
and temporary storage are removed whether the run succeeds or fails. The command validates the
local compatibility topology; the Worker, R2, Durable Object, and Container release gate remains
a separate Linux or WSL staging requirement.

## Product boundary

Marl has six primary product surfaces:

- Home: a compact view of your inbox, recent runs, and repositories.
- Inbox: mentions, assignments, and relevant updates.
- Code: repositories, files, branches, and history.
- Issues: repository work, discussion, assignment, and triage.
- Pull requests: review, checks, and merging.
- Runs: self-hosted CI jobs, live logs, and artifacts.

Features outside that loop are intentionally deferred.
