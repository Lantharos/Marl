# Database changes

The API uses Drizzle's SQLite schema in `apps/api/src/db/schema`. The tables are grouped by domain and exported through `index.ts`. Authentication uses the same table definitions. `database(env)` exposes a typed D1 client; existing parameterized SQL remains useful for specialized queries and atomic conditional writes.

Generate and inspect a migration after editing the schema:

```sh
bun run --cwd apps/api db:generate --name describe_the_change
bun run --cwd apps/api db:check
bun run --cwd apps/api db:migrate
```

Commit the schema, generated SQL, and migration metadata together. Wrangler applies the generated SQL to D1; the application does not run migrations on requests. Inspect SQLite table rebuilds carefully: Drizzle Kit can misquote expression indexes when recreating a table, and a rebuild must recreate that table's triggers. Verify generated SQL against a fresh local database before applying it to stored data.

The baseline replaces the old migrations because Marl has no deployed data. To start over with a clean local environment:

```sh
bun run db:reset
```

Stop `bun dev` before resetting. The local D1 database, object storage, Durable Object state, and Git repositories move together into `.marl-data/backups/<timestamp>`, so the database never points at repositories from an earlier run. `bun dev` also applies pending migrations.

## Demo data

With `bun dev` running on a fresh database, `bun run seed` creates a small team, the Lumen organization with a realistic TypeScript repository, issues, pulls in every state (reviewed, failing checks, draft, stacked, closed, merged, and one opened by an agent), check runs, releases, and saved replies. Activity is spread over the past few weeks. Sign in as `demo` with the password in `scripts/seed/accounts.ts`; the other accounts use the same password.

SQLite triggers enforce immutable audit events, timeline synchronization, current-head review and check approvals, and signing-key invalidation. Drizzle does not model triggers, so those live in the custom `0001_invariants.sql` migration. Change that migration only while resetting an undeployed baseline; once deployed, generate a new custom migration for trigger changes.

Before launch, apply the same migration set to an isolated D1 database, exercise real authentication and Git operations, and perform a D1 Time Travel restore with the matching object-storage snapshot. Local SQLite checks cannot establish production backup recovery.
