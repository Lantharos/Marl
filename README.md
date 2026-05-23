# sty

sty is a hosted collaboration service for PIG projects, operated by Lantharos. It adds identity, tenant/project hosting, permissions, issues, workspaces, releases, webhooks, API keys, OAuth apps, and the browser dashboard.

Most users do not run sty infrastructure. Run the installer, choose both tools, sign in, connect a repository, and use PIG normally.

E2EE and built-in CI execution are intentionally deferred. External systems can report workspace status checks through the API.

## Using sty

Install sty and PIG. The installer asks whether you want both tools or just PIG:

```powershell
# macOS / Linux
curl -fsSL https://sty.sh/install.sh | sh

# Windows
irm https://sty.sh/install.ps1 | iex
```

```powershell
sty login
sty init
pig save "describe the work"
pig sync
```

`sty init` fetches the tenants your account can use, lets you choose one or create an organization tenant, asks for the project name, and defaults that name to the current folder. For scripts and agents, pass the same values explicitly:

```powershell
sty init --tenant tenant --project project
sty init --new-tenant tenant --project project
sty init --tenant tenant --project mobile --folder product
sty init --target tenant/project
sty tenant new --name tenant
sty project create --tenant tenant --project website --folder product
```

Use project folders when a product is split across separate repositories. The remote for each repository is still `tenant/project`; the folder is organization metadata used by sty lists and dashboards. In the tenant home, maintainers can create nested folders and drag projects into them.

To download a project without forking it or configuring a PIG remote:

```powershell
sty clone source-tenant/source-project
sty clone source-tenant/source-project ./source-copy --workspace main
```

To start from a public project, fork it:

```powershell
sty fork source-tenant/source-project
```

The command asks whether the fork should stay linked for a future contribution or become an independent project. A linked fork creates a private project in your tenant, creates a contribution workspace, and can connect and sync the current directory. For non-interactive use:

```powershell
sty fork source-tenant/source-project --tenant tenant --project project --mode contribute --yes
sty fork source-tenant/source-project --tenant tenant --project project --mode detached --yes --no-sync
```

When work in a linked fork is ready, send the current workspace back to the parent:

```powershell
sty sendwork
sty sw --title "Fix parser edge case" --message "Keeps empty segments stable" --yes
```

Your account tenant is created automatically from your Ave handle. To create an organization tenant:

```powershell
sty tenant new
sty init --tenant tenant --project project
```

`sty login` opens the browser sign-in flow, creates a sty session, and imports that session into PIG. `sty init` creates or connects the hosted project and configures the PIG remote for the current repository.

After that, use PIG from the repository:

```powershell
pig status
pig save "describe the change"
pig work new feature-name
pig work ready
pig sync
```

Use `--json` on PIG commands when agents or scripts need machine-readable output.

## What sty Provides

- Hosted PIG remotes under `tenant/project` namespaces
- Private projects by default, with public project discovery when maintainers opt in
- Tenant and project collaborators with viewer, contributor, and maintainer roles
- Browser project pages with code, workspaces, issues, releases, history, and settings
- Ready review for workspaces, saves, files, and line comments, with persisted approvals and status checks
- Merge rules for required approvals, passing checks, unresolved file conversations, and protected workspaces
- Public project forks, linked contribution forks, detached project copies, and `sendwork`
- Release notes, pinned source snapshots, uploaded artifacts, and optional public release downloads
- Project API keys with granular scopes for agents and integrations
- Webhooks for sync, snapshot, workspace, release, and issue events
- OAuth-style developer apps that mint project-scoped tokens after maintainer approval
- User-scoped signing keys and signed snapshot verification
- Project archive state that keeps projects readable while blocking mutations
- Audit log and a notifications inbox for review and merge activity

## Developing From Source

The hosted service is implemented in this repository. The backend is a Cloudflare Worker in `server`; the frontend is a SvelteKit app in `frontend`; the CLI lives in `client`.

The Worker uses D1 for project metadata, workspace heads, issues, history, settings, release metadata, protocol records, API keys, webhooks, OAuth apps, and cached project stats. R2 stores immutable PIG object bytes and uploaded release artifacts. R2-backed objects, bounded code trees, file reads, and project overview responses return ETags and cache headers so browsers and Cloudflare can avoid refetching content until the relevant snapshot or project state changes.

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

If you are using Fedora's system Rust packages instead of Rustup, install the packaged target:

```powershell
sudo dnf install rust-std-static-wasm32-unknown-unknown
```

- Bun for frontend and Wrangler commands.
- Wrangler, run with `bunx wrangler ...`.
- `worker-build` for the Rust Worker build step:

```powershell
cargo install worker-build
```

Make sure Cargo's binary directory is on your PATH:

```powershell
export PATH="$HOME/.cargo/bin:$PATH"
```

## Build The CLI From Source

Build the Rust workspace from the repo root:

```powershell
cargo build
```

The `sty` binary will be in Cargo's debug output, usually `target/debug/sty` on macOS/Linux or `target\debug\sty.exe` on Windows. You can either reference that binary directly:

```powershell
target\debug\sty.exe whoami
```

or add the debug output directory to your `PATH` while developing so `sty` works like a normal command.

## Run The Worker Locally For Development

From `server`, apply the D1 schema before using the API. Use local migrations for `wrangler dev`:

```powershell
cd server
bunx wrangler d1 migrations apply sty-db --local
```

Run this again whenever a new migration is added. The current migrations create account keys, remote approvals, private project follows, cached project statistics, tenant/project collaborators, project archive state, project API keys, webhooks, developer apps, fork contribution links, history metadata columns, project folders, user profile pins, workspace reviews, reactions, status checks, audit events, and notifications.

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

## Run The Frontend For Development

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

## Collaboration And Permissions

sty has tenant-scoped and project-scoped collaborators.

- `owner` is implicit and cannot be assigned.
- `maintainer` can manage settings, releases, collaborators, ready merges, hooks, webhooks, and other project administration.
- `contributor` can sync code, create issues/comments, mark work ready, and update normal project work.
- `viewer` can read private projects without write access.

Tenant collaborators inherit access into every project in that tenant. Project collaborators apply only to one project. Tenant owners can manage tenant collaborators; project owners, tenant maintainers, and project maintainers can manage project collaborators.

Workspaces can be `private`, `team`, or `public` inside a project. `main` is public within the project, non-main workspaces default to team visibility, and a public workspace is only public to the internet when the project itself is public. Private workspaces are readable by their creator and maintainers; team workspaces are readable by project collaborators.

Project maintainers can archive a project from Settings. Archived projects stay readable, but code sync, object uploads, issues, comments, releases, ready actions, and other project mutations are rejected until a maintainer unarchives the project. Project owners can delete a project from Settings after confirming the action.

Project API keys are maintainer-managed tokens for tools and agents. Keys are scoped to one project and use explicit permissions such as `main:read`, `main:write`, `workspaces:create`, `workspaces:write`, `issues:write`, `releases:write`, and `webhooks:write`. This lets an agent work in feature workspaces without being able to advance `main`; add `issues:write` when the agent should leave review comments. Webhooks are also project-scoped and can subscribe to manual, sync, snapshot, workspace, release, and issue events. Event webhooks are delivered after the project mutation response, and deliveries include `x-sty-event`, `x-sty-delivery`, and an HMAC-SHA256 `x-sty-signature-256` when a secret exists.

Maintainers can make release metadata and release artifact downloads public even when the project itself is private. This is useful for auto-updaters or public download buttons while keeping code, issues, and history private.

Public projects can be forked from the CLI. A linked fork remembers its parent, keeps the contribution workspace private in the fork, and only creates ready work in the parent when `sty sendwork` runs. A detached fork copies the project history into the chosen tenant and breaks the parent link.

Workspace review happens in the browser. Reviewers can comment on the whole workspace, a save in history, a file, an individual line, or a dragged line range in the code and diff panes. Workspace metadata stores reviewers, assignees, milestone, linked issues, lock state, and visibility. Maintainer approvals and changes-requested reviews are stored as review records tied to the ready workspace head. Maintainers can require approvals, require passing external checks, block unresolved file conversations, and protect workspaces such as `main` from direct sync pushes. Maintainers can request changes on a ready workspace, which moves it out of the ready queue and records the reason in the review thread.

CLI examples:

```powershell
sty tenant collaborators list tenant
sty tenant collaborators add tenant kristof --role maintainer
sty project collaborators list tenant/project
sty project collaborators add tenant/project ave --role contributor
sty project collaborators update tenant/project ave --role viewer
sty project collaborators remove tenant/project ave
sty fork source/project --tenant tenant --project project --mode contribute --yes
sty fork source/project --tenant tenant --project project --mode detached --yes --no-sync
sty sw --title "Fix parser edge case" --message "Keeps empty segments stable" --yes
```

The dashboard exposes tenant collaborators on the tenant page and project collaborators in project settings.

## Protocol Features

The Worker exposes `/v1/capabilities` and advertises the implemented PIG protocol features:

- issues, comments, labels, and milestones
- ready queues, workspace merge metadata, and targeted review comments
- workspace reviews, status checks, merge rules, audit log, and notifications
- hooks and webhooks
- granular project API keys and developer app integrations
- search
- private project follows, home feed, public project discovery, paginated tenant project pages, and project settings
- public project forks, detached copies, linked contribution forks, and `sendwork`
- releases, tags, changelog notes, pinned source snapshots, uploaded artifacts, and optional public release downloads
- signed snapshot verification with user-scoped signing keys
- profiles and account signing keys
- permissions and collaborators for tenants and projects
- archived project state and read-only enforcement
- public project forks and linked `sendwork` contributions

Developer apps live in User Settings. They receive a client id and a one-time client secret, then can start an OAuth-style authorization by sending users to:

```text
/oauth/authorize?client_id=...&redirect_uri=...&tenant=tenant&project=project&scope=workspaces:create%20workspaces:write%20webhooks:write
```

After approval, the app exchanges the returned code with `POST /v1/oauth/token` and receives a project-scoped bearer token. Sty requires the approving user to be a maintainer of the selected project.

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

Fork endpoints:

```text
POST /v1/forks
POST /v1/tenants/:tenant/projects/:project/sendwork
```

`POST /v1/forks` accepts a source project, target project, and mode. `mode: "contribute"` stores a parent link and creates a contribution workspace in the fork. `mode: "detached"` copies the project into the target tenant without a parent link. `sendwork` is only valid for linked forks; it publishes the fork workspace head and title/message back to the parent project as ready work.

The dashboard keeps ready review inside the Workspaces view. It uses `GET /v1/tenants/:tenant/projects/:project/stats` for tab counters, and those counts are maintained in D1 when workspaces, issues, releases, and history change, so the UI does not need to fetch every list just to show navigation totals. Project comments can be filtered by `target_type`, `workspace`, `history_entry_id`, `file`, and `line` so review panes only load the discussion for the active save or file position. Issue and comment reactions are persisted per user and returned as grouped reaction counts.

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
