# sty

sty is the hosted collaboration layer for PIG projects. It provides identity, projects, permissions, review, releases, API keys, OAuth apps, webhooks, and the browser dashboard.

The maintained human and agent docs live in the sty frontend:

- `/docs/sty` for the hosted product model
- `/docs/sty/cli` for the sty CLI reference
- `/docs/sty/projects` for tenants, collaborators, and visibility
- `/docs/sty/review` for ready workspaces, approvals, checks, and merge rules
- `/docs/sty/development` for running the Worker, frontend, and CLIs from source
- `/docs/api` and `/docs/protocol` for integrations and remote implementers
- `/docs/agents` and `/docs/llms.txt` for automation and coding agents

Local development:

```sh
cd frontend
bun install
bun run dev
```

```sh
cd server
bunx wrangler d1 migrations apply sty-db --local
bunx wrangler dev
```

```sh
cargo build
```
