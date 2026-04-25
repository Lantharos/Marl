Sty — Platform Spec



The official hosting platform for pig. Not open source. sty — TUI + MCP client (open source) sty.sh — the web platform (proprietary)



What Sty Is

Sty is the hosted collaboration and visibility layer built on top of pig. It's what GitHub is to Git, except rebuilt from scratch to match how pig actually works — no PRs that are secretly just branch diffs, no commit graphs that mean nothing to most people.

pig is the engine. Sty is everything around it that makes it work for teams, open source projects, and agent-heavy workflows.



Product Split

sty CLI/TUI (open source)

A terminal client and MCP server for interacting with sty.sh without leaving your terminal. Humans use the TUI, agents use the MCP. Both talk to the same sty.sh API.

sty.sh (proprietary)

The web platform. Full experience — richer views, settings, visualizations, and everything that doesn't make sense in a terminal.



sty TUI

Features





View and manage issues



See workspace status across a project



Review incoming workspaces marked ready



Trigger and monitor merges



View CI status per workspace



Comment on merge requests



Notifications feed (ready to merge, CI failed, conflicts, comments)

MCP Tools

Agents can use all of the above programmatically via the bundled MCP server.





list_workspaces — get all workspaces and their status



merge_workspace — trigger a merge



get_issues — fetch issues for a project



create_issue — open a new issue



get_ci_status — check CI status for a workspace



comment — comment on a workspace or merge request



get_notifications — fetch unread notifications

Tech Stack







Layer



Choice



Reason





TUI



Rust + Ratatui



Consistent with pig's stack, single binary





MCP server



Bundled with sty binary



Same pattern as pig



sty.sh Web Platform

Core





Project hosting with full workspace dependency graph visualization



Checkpoint + cram history browser with diff viewer



Merge request flow — lightweight, derived from work ready



Public / private projects



Forks (implemented as top-level workspace derivations)



Stars, issues, discussions

Permissions





Owner, maintainer, contributor, viewer



Workspace-level permissions (can create, can merge, can view only)



PAT (personal access tokens) for CLI/agent auth



Scoped tokens — read-only, save-only, etc. for agents



Audit log of every token action

CI/CD





Hooks: on-save, on-cram, on-ship, on-merge, on-ready



Built-in pipeline runner or webhook to external (GitHub Actions compatible for migration ease)



Per-workspace CI runs — know if a workspace is broken before merging

Agent Visibility





Agent activity feed per project — every agent session visible



Diff-by-diff breakdown of what an agent did in a session



One-click undo of an entire agent session



Agent identity on every save (which model, which tool)

Open Source Features





Public projects with full history



Contributor workspace model — fork = workspace, merge request = work ready



Maintainer merge queue



Changelog auto-generated from ship tags



Milestones

M1 — Platform Alpha

Project hosting, workspace browser, merge request flow, basic CI hooks

M2 — sty TUI + MCP

Terminal client, full MCP surface, agent-usable

M3 — Agent Features

Agent attribution UI, session undo, agent activity feed

M4 — Open Source Features

Public projects, fork model, merge queue, changelogs

M5 — Teams + Permissions

Orgs, roles, scoped tokens, audit log



Nice to Have / Future

Dependency Graph Visualization

Visual map of all workspaces, their dependencies, and merge status.

ship Changelogs

Auto-generate a changelog from the intent log between two ship tags. Human-readable, structured, exportable.

Live Collaboration Mode

Real-time co-editing within a session. Saves as a collaborative snapshot with multiple authors. Probably CRDT-based.

Analytics

Velocity metrics — saves per day, time between save and ship, conflict rate. Useful for teams, not surveillance.



Open Questions





Pricing model — per seat, per project, free tier limits



Whether the sty TUI is a separate repo or a monorepo with sty.sh backend



Self-hosting story for sty.sh (enterprise tier?)

