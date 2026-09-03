# Marl product contract

## Purpose

Marl is the daily workspace for hosting code, tracking work, reviewing changes, and running checks on
self-hosted machines. It should be comfortable enough to remain open all day and precise
enough that developers can understand the state of their work without reconstructing it
from several pages.

Marl is one product. The local repository engine, CLI, hosted application, API, and runner
are implementation parts of Marl, not separately branded products.

## Primary loop

Every product decision must improve this loop:

1. Create or switch to a line of work.
2. Capture and discuss work in an issue when it needs durable ownership or triage.
3. Save a meaningful revision.
4. Push it to Marl.
5. Open a pull.
6. Review code and discuss specific lines.
7. Run required checks on self-hosted runners.
8. Resolve blockers and merge.

If a feature does not materially improve this loop, it does not belong in the initial
product.

## Vocabulary

The public vocabulary is deliberately familiar:

| Term | Meaning |
| --- | --- |
| Repository | One codebase and its revision history. |
| Branch | A named line of work. |
| Commit | A saved revision. |
| Release | A named, downloadable version of a repository. |
| Issue | A tracked unit of repository work or discussion. |
| Pull | A proposed merge from one branch into another. |
| Review | An approval, request for changes, or review comment. |
| Check | One result attached to a commit or pull. |
| Run | A collection of CI jobs triggered together. |
| Runner | A self-hosted machine that executes jobs. |

Implementation-specific concepts must not leak into product language unless they provide
a concrete capability that cannot be explained with these terms.

## Primary navigation

The global application contains:

- Home
- Inbox
- Issues
- Pulls
- Runs
- Repositories
- Runners

A repository contains:

- Code
- Releases
- Issues
- Pulls
- Runs
- Settings

Settings is administrative. It must never become a bucket for primary workflows.

User and organization names open public profile pages. Profiles make identity, public
repositories, organization membership, and recent public work legible without exposing account
or organization administration. User profiles include a year of public contribution activity;
organization profiles emphasize their public repositories and the people maintaining them.

## Home

Home opens with a compact Inbox preview, then keeps recent runs and frequently used repositories
within reach. It does not invent a generic attention score or present empty operational queues as
personal work.

## Inbox

Inbox answers one question: what changed that is relevant to me? It contains direct mentions,
current issue and pull assignments, new activity on work the user authored or joined, and
failed workflow runs triggered by that user. Read state and done state are personal and durable;
newer activity moves a finished item back into the Inbox. Home previews the newest active items,
while the full Inbox separates active, unread, and done work.

Repository membership alone never subscribes someone to every event. Marl only adds an item when
it can explain the direct relationship between the user and the work.

## Code

Code browsing must preserve repository context while moving through branches, directories,
files, and commits. The file tree, current branch, latest commit, path, and related pull state
should remain easy to reach.

## Issues

Issues are repository-scoped work and discussion with numbering independent from pulls.
`#12` refers to issue 12 and `!12` refers to pull 12 in the current repository, so both
can exist without ambiguity. Issues support open and closed states, editable descriptions and
comments, durable deletion tombstones, assignees, repository labels, conversation locking, and a
complete actor-attributed timeline. Global Issues provides one searchable queue across every
repository the current user can read; repository Issues preserves label filtering and repository
context. Open queues group work by its actual next move: in motion, needing a decision, or needing
an owner. The issue page treats its editable work brief as the current source of truth and keeps
decisions, comments, and references in a separate activity stream. When no pull is linked, an issue
can open a prefilled pull that preserves the closing reference. Only repository triage roles manage
assignment, labels, and locks, while issue authors
can edit and close their own work. References in descriptions, comments, reviews, and review
conversations create durable links and backlink timeline entries. References may use the current
repository shorthand or a qualified form such as `lantharos/marl#12` and `lantharos/marl!7`.

## Pulls

Pulls are Marl's flagship surface. The open queue is organized by the next useful action instead
of chronology alone: ready to land, needing attention, in review, or still taking shape. A
developer must be able to understand the proposal, review every file, follow conversations,
inspect checks, and identify every merge blocker without hunting across unrelated screens.

A pull moves from draft to ready and can be closed or reopened without losing its review record.
Its overview leads with the current move and its merge requirements, keeps the editable change
brief distinct from review activity, and names the exact head revision being discussed. Its
activity includes replies, editable comments, durable deletion
tombstones, reversible thread resolution, and an owner-controlled conversation lock. Reviewers
start line or range conversations directly from the changes view; those conversations also
appear in the timeline with their exact file and line range, then collapse when resolved. Title,
description, lifecycle, lock, assignment, label, merge, and thread-resolution changes are durable
timeline events. The conversation composer keeps comment, review, every allowed merge method,
close, and reopen actions together without navigating away. Choosing an action makes it the
composer's primary submit behavior and includes the written comment when present. Assignees and
repository labels make ownership and triage visible without replacing review state. The commits,
changes, checks, and overview views all describe the same pinned head revision.

Pull descriptions can close linked issues with `fixes`, `closes`, or `resolves`. Closing
occurs atomically with a successful merge into the repository's default branch; merging into any
other branch preserves the link without changing issue state.

Repository owners configure merge rules from the branches surface: required approvals,
successful checks, resolved conversations, stale-approval dismissal, and the allowed merge,
squash, or rebase methods. These rules are enforcement policy, not UI suggestions.

## Releases

Releases turn an existing branch or commit into a durable version identified by a real Git tag.
Drafts are visible only to repository collaborators, while published releases can be marked as a
prerelease or as the repository's single latest release. Publishing a draft creates its tag
through the same canonical Git publication path as a push, so the database cannot advertise a tag
that Git clients cannot fetch.

A release has Markdown notes, automatic ZIP and tar.gz source archives, and optional binary
assets. Asset uploads are resumable multipart transfers with bounded sizes and exact part
validation. Deleting a release removes its uploaded assets but deliberately leaves the Git tag in
history. See [`releases.md`](releases.md) for lifecycle and limits.

## Runs and runners

Runs expose queue time, execution time, job dependencies, live logs, runner identity,
cancellation, retry, and artifacts. A waiting job explains which runner labels it requires.

Runners are always self-hosted. Marl does not imply that hosted execution is available or
planned.

## Explicitly deferred

- Leaves
- Gallery and screenshots
- Social following
- Project appearance customization
- Components and monorepo dashboards
- Package registries
- OAuth applications and integration marketplaces

Deferred means absent from navigation, schemas, and initial APIs—not implemented and hidden.

## Quality bar

A milestone is complete only when:

- Its empty, loading, error, partial, and populated states are designed.
- Keyboard and pointer interaction are both usable.
- The screen works at laptop and desktop widths.
- Important state is represented by text or iconography, not color alone.
- The implementation passes type checks and relevant tests.
- The actual rendered UI has been inspected.
- Marl can use the feature in its own development workflow where applicable.
