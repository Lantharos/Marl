# Database changes

The API uses Drizzle's SQLite schema in `apps/api/src/db/schema`. The tables are grouped by domain and exported through `index.ts`. Authentication uses the same table definitions. `database(env)` exposes a typed D1 client; existing parameterized SQL remains useful for specialized queries and atomic conditional writes.

Generate and inspect a migration after editing the schema:

```sh
bun run --cwd apps/api db:generate --name describe_the_change
bun run --cwd apps/api db:check
bun run --cwd apps/api db:migrate
```

Commit the schema, generated SQL, and migration metadata together. Wrangler applies the generated SQL to D1; the application does not run migrations on requests. Inspect SQLite table rebuilds carefully: Drizzle Kit can misquote expression indexes when recreating a table, and a rebuild must recreate that table's triggers. Verify generated SQL against a fresh local database before applying it to stored data.

The baseline replaces the old migrations because Marl has no deployed data. To initialize a clean local database:

```sh
bun run --cwd apps/api db:reset
```

Stop the local API before resetting. The previous D1 directory is moved into `.wrangler/d1-backup-*`; Git repositories and object storage are not touched. `bun dev` also applies pending migrations.

SQLite triggers enforce immutable audit events, timeline synchronization, current-head review and check approvals, and signing-key invalidation. Drizzle does not model triggers, so those live in the custom `0001_invariants.sql` migration. Change that migration only while resetting an undeployed baseline; once deployed, generate a new custom migration for trigger changes.

Before launch, apply the same migration set to an isolated D1 database, exercise real authentication and Git operations, and perform a D1 Time Travel restore with the matching object-storage snapshot. Local SQLite checks cannot establish production backup recovery.
