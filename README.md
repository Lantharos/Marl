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

Start the web application and API together:

```powershell
bun dev
```

Or run either surface independently:

```powershell
bun dev:web
bun dev:api
```

The Smart HTTP gateway is a separate Rust process:

```powershell
cargo run -p sty-git
```

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
