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
- derived branch, commit, and tree metadata;
- pull requests, reviews, threads, checks, immutable timeline events, and merge state;
- runs, jobs, runner registrations, leases, logs, and artifacts.

Canonical Git packs, log chunks, and artifacts live in object storage. Repository file
contents are read with exact R2 range requests from canonical packs instead of being copied into
one object-storage entry per blob. Relational state is derived from published repository
generations and lives in the database. Runners claim label-compatible jobs through authenticated
leases. Each job has a hibernating realtime room for new log frames, while persisted cursor-based
pages recover anything missed during disconnects. Completed artifacts are loaded once, after the
run reaches a terminal state.

## Identity and access

Sty owns its identity database and sessions. Email and password are the recovery-capable root
credential, while passkeys and authenticator-based two-factor authentication strengthen the same
account. Ave is an optional, explicitly linked OpenID Connect identity; it cannot create a Sty
account or implicitly attach itself by matching an email address. An Ave outage therefore cannot
prevent local account recovery or create a dependency cycle when Ave itself is hosted on Sty.

Browser sessions use secure, HTTP-only cookies. Sensitive changes such as repository deletion,
ownership transfer, organization role changes, runner enrollment, and developer-token management
require a recently created session. Personal access tokens are separately hashed, expire, are
shown only once, and carry explicit repository and operation scopes; they are never accepted as a
browser step-up credential.

Verification, recovery, and organization invitation email is sent directly by the API Worker
through a sender-restricted Cloudflare Email Service binding. Local development writes action URLs
to the API log instead of delivering mail.

Authorization has one repository capability resolver. It combines organization ownership, the
organization's base repository role, direct collaborators, team grants, repository visibility,
and token restrictions into `read`, `triage`, `push`, `maintain`, and `admin` decisions. Feature
handlers do not recreate membership SQL or infer permissions from the UI. Organization owners and
administrators manage invitations and teams, only owners change organization-wide policy, and
personal organizations cannot gain additional members.

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

## Hosted repository storage

Git's object model remains canonical, but a long-running bare repository does not. R2 stores
immutable `.pack` and `.idx` files. A repository Durable Object owns the authoritative refs,
active generation, manifest pointer, publication lease, and derived object-locator catalog in
SQLite rows. An organization Durable Object owns upload reservations and eventual quota
settlement in its own SQLite row store. Repository publication never depends on cross-object
accounting completing successfully.

A native push follows this flow:

1. The organization reserves the declared compressed bytes and the repository acquires a
   compare-and-swap lease for the expected refs.
2. The client uploads up to four packs through Worker-gated 64 MiB multipart parts. Exact
   sizes, part numbers, retry counts, and a 256 MiB compressed push ceiling are enforced
   before R2 receives a part.
3. Uploads land under an R2 quarantine prefix. A short-lived validator receives the
   submitted packs and only the active pack indexes.
   `git index-pack --strict` verifies pack and object integrity, followed by object-count,
   expanded-size, blob-size, graph-completeness, and proposed-ref checks.
4. Validated packs, Git indexes, and compact object-graph indexes are promoted to
   content-addressed canonical keys. Each object record identifies its pack offset, packed
   and expanded sizes, type, and structural references without storing object contents in a
   database row. The
   repository Durable Object atomically publishes a new immutable manifest generation and
   its refs. Quota settlement is idempotent and may reconcile after publication. A separate
    alarm-backed job derives branch, commit, tree, and workflow state in bounded generation-tagged
    pages without holding the push connection open. A newer completed generation prunes stale
    derived rows only after all of its pages have arrived.

The client proposes bytes; Sty decides whether they are publishable. Upload-session alarms
abort abandoned multipart uploads, remove tracked quarantine objects, release leases, or
settle a push that was committed before its request disappeared. A successful publication is
recorded durably before its response is returned. If that response disappears, Sty reads the
commit record and completes accounting instead of deleting possibly published objects.

Native fetch reads refs and a generation manifest from the Worker, then downloads the pack
and index files for that exact generation. Source blob reads resolve the validated object catalog
and fetch only the packed byte range required for the object and its bounded delta chain. Missing
derived locator rows are rebuilt from the canonical R2 object index. Old packs remain available for a 31-day recovery
window so an in-flight fetch can finish after compaction. Standard `git clone`, `git fetch`,
and `git push` use a compatibility Container. It hydrates an exact generation from R2 packs,
runs Git Smart HTTP, captures only newly reachable objects, and publishes through the same
validation and manifest path as a native push. Containers never own durable repository state
and Git never operates on an R2 FUSE mount.

Generations compact in an alarm-backed maintenance job when they reach twelve packs. Indexing
and compaction share a persisted operation model with queued, running, retrying, and completed
states, attempt counts, last errors, bounded backoff, and an operator-readable status endpoint.
Newer generations safely supersede older queued work. The
maintenance Container creates and strictly indexes one self-contained pack, publishes it as
a replacement generation, reconciles the storage delta, and retires superseded packs after
    the recovery window. Compatibility and validator Containers use the 1 GiB/4 GB `basic` shape.
Compatibility sleeps after one idle minute, while validators stop as soon as a push is checked.
Compaction uses an isolated 4 GiB/8 GB `standard-1` Container and stops immediately when the
job ends. Validator and maintenance Containers have no Internet access.

Initial defensive limits are 2 GiB per repository, 10 GiB per organization, 1 GiB expanded
per push, 100 MiB per blob, 50,000 objects per push, and 32 changed refs per push. These are
implementation and abuse ceilings unless they describe a user-facing storage or upload limit.

Open pull requests pin their current base and head plus immutable reviewed revisions under
`refs/sty/pulls`. These refs are included in pack capture and compaction, so force-pushing a
branch cannot silently garbage collect commits used by an active or historical review. Merge,
squash, and rebase operations carry the stable pull-request ID into their published result and
are idempotent across gateway retries. The relational pull-request row and branch index
reconcile after Git publication; they are not the source of truth for whether the target Git
ref advanced.

Branch merge rules live in D1 and are evaluated by the API at merge time against the current
head's reviews, checks, and conversations. Git ref publication still provides the final
compare-and-swap boundary, preventing a target update that raced with policy evaluation from
being overwritten.

HTTP request bodies and internal Worker-to-Durable-Object messages are size-bounded and
runtime-validated before domain logic sees them. Repository access is decided by one capability
model for public reads, organization membership, writable repositories, and owner administration.
Sensitive repository, branch-rule, pull-request, merge, and ref-index mutations append immutable
audit events, with state and audit writes sharing a D1 batch whenever they share a transaction.

Pull-request mutations write their state change, timeline event, and monotonic realtime cursor in
the same D1 batch. Events preserve the actor and structured before-and-after details. A hibernating
Durable Object room per pull request fans those persisted deltas out to connected reviewers; it
does not own or duplicate pull-request state. Reconnecting clients catch up from D1 by cursor, so
lost WebSocket delivery cannot lose a review action. Check transitions and synchronized branch
heads publish through the same delta stream.

Pull-request detail initially includes the first two and latest thirty timeline entries. The
middle is represented by an exact hidden count and loaded backward by sequence cursor on demand.
Diffs and their review threads load only when the Changes tab is opened. Local mutations patch the
returned entities directly and request the small merge-state projection only when an action can
change merge eligibility.

Repository routes use SvelteKit's Cloudflare adapter and load repository, pull-request, run,
runner, and settings data through route loaders so the initial response is server-rendered. The
root loader supplies the repository list to both the shell and child routes without a second
browser fetch. Client requests are reserved for user-driven changes, cursor pagination, and narrow
live updates, keeping the current document mounted while mutations run. Route loaders translate
API failures into their original HTTP status
so missing, forbidden, and unavailable resources render the correct error boundary. Sty keeps
SvelteKit's routing and rendering model instead of introducing a second React runtime for typed
routing or server functions.

Production storage protections, recovery checks, and the acknowledgement contract are
documented in [`repository-reliability.md`](repository-reliability.md).

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
