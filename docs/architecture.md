# Sty architecture

## Principles

1. One repository, product, executable, and public vocabulary.
2. Rust is reserved for local filesystem, repository, diff, merge, checkout, and process
   execution work.
3. The hosted control plane is TypeScript and owns HTTP APIs, authorization, metadata,
   orchestration, and Cloudflare bindings.
4. API contracts are explicit and shared. UI components do not depend on database rows.
5. New behavior is implemented as a complete vertical slice with tests and rendered states.
6. There is no compatibility layer for the discarded prototype.

## Repository layout

```text
apps/web            SvelteKit application
apps/api            TypeScript control-plane Worker
apps/git-edge       Cloudflare Worker and Container routing for Git
packages/contracts  Shared transport types and validation
crates/sty-core      Local repository engine
crates/sty-cli       The `sty` executable
crates/sty-git       Smart HTTP Git gateway
crates/sty-runner    Self-hosted job execution
```

The discarded prototype is not part of this workspace and has no compatibility layer.

## Web application

The web application uses SvelteKit and a semantic design-token layer. Product pages render
control-plane state; demo fixtures do not ship in product routes.

The global shell owns repository switching, search, command access, current
identity, and global navigation. Repository pages render inside that shell rather than
creating a second navigation system.

## Control plane

The TypeScript API begins with a new database schema. It owns:

- identities, organizations, repositories, and membership;
- branch heads and hosted object metadata;
- pull requests, reviews, threads, checks, and merge state;
- runs, jobs, runner registrations, leases, logs, and artifacts.

Browsable Git objects, log chunks, and artifacts live in object storage. Relational state
lives in the database. Runners claim label-compatible jobs through authenticated leases,
and the web application polls the API while an active run is open. A future realtime
transport may reduce latency without changing the persisted run model.

## Git and the local core

Git compatibility is non-negotiable. Sty hosts ordinary Git repositories; a developer can
use `git clone`, `git fetch`, and `git push` without adopting a new version-control model.
The `sty` CLI improves authentication, repository inspection, pull requests, and runners,
but never replaces Git or creates a second repository database.

PIG's custom database, remotes, semantic layer, TUI, and public vocabulary are discarded.
The useful product lessons survive as typed status, history, tree, blob, and diff APIs with
strict path safety and machine-readable output.

The core exposes a library API consumed by the CLI. It does not know about terminal
rendering, HTTP sessions, or browser product concepts.

Hosted Smart HTTP is a narrow Git gateway responsibility. The control-plane Worker owns
authorization and metadata; the gateway performs protocol and packfile work with short-lived
authorization from the control plane. On Cloudflare, each repository routes through a named
Container/Durable Object. Git operates on the container's local POSIX filesystem, while
compressed bare-repository snapshots are restored from and written to R2 around mutations.
Git never operates directly on an R2 FUSE mount. Browsable blobs remain separately
content-addressed in object storage for the web API.

## Runner

The runner ships with the `sty` executable but is internally separated from interactive CLI
commands. It supports registration, installation as an operating-system service, concurrent
job execution, Docker job and service containers, dependency-aware scheduling, matrices,
timeouts, incremental log upload, isolated checkouts, artifacts, caches, and health reporting.

Repository commands never execute directly on the runner host. The host process manages Git
checkout, authenticated leases, Docker lifecycle, log transport, caches, and artifacts.

## Completion discipline

Work proceeds in this order:

1. Contracts and data model.
2. Rendered interaction design.
3. Control-plane behavior.
4. Local/runner integration.
5. End-to-end verification and dogfooding.

The next product area does not begin while the current area still relies on placeholder
states, unverified interactions, or undocumented manual setup.
