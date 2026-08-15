# Sty

Sty is a focused code-hosting platform for repositories, pull requests, and self-hosted CI.

This repository is undergoing a ground-up rebuild. The current product contract lives in
[`docs/product.md`](docs/product.md), and the implementation boundaries live in
[`docs/architecture.md`](docs/architecture.md).

Runner registration, repository workflows, service installation, labels, logs, and
artifacts are documented in [`docs/runners.md`](docs/runners.md).

## Development

Install JavaScript dependencies once:

```powershell
bun install
```

Start the web application, API, and local Git gateway together:

```powershell
bun dev
```

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

## Product boundary

Sty has four primary product surfaces:

- Home: work that needs attention.
- Code: repositories, files, branches, and history.
- Pull requests: review, checks, and merging.
- Runs: self-hosted CI jobs, live logs, and artifacts.

Features outside that loop are intentionally deferred.
