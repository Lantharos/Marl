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
5. Open a pull request.
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
| Issue | A tracked unit of repository work or discussion. |
| Pull request | A proposed merge from one branch into another. |
| Review | An approval, request for changes, or review comment. |
| Check | One result attached to a commit or pull request. |
| Run | A collection of CI jobs triggered together. |
| Runner | A self-hosted machine that executes jobs. |

Implementation-specific concepts must not leak into product language unless they provide
a concrete capability that cannot be explained with these terms.

## Primary navigation

The global application contains:

- Home
- Issues
- Pull requests
- Runs
- Repositories
- Runners

A repository contains:

- Code
- Issues
- Pull requests
- Runs
- Settings

Settings is administrative. It must never become a bucket for primary workflows.

User and organization names open public profile pages. Profiles make identity, public
repositories, organization membership, and recent public work legible without exposing account
or organization administration. User profiles include a year of public contribution activity;
organization profiles emphasize their public repositories and the people maintaining them.

## Home

Home answers one question: what needs my attention?

It prioritizes requested reviews, blocked pull requests, failed runs, active work, and
unhealthy runners. Generic activity, vanity metrics, social feeds, and discovery do not
belong here.

## Code

Code browsing must preserve repository context while moving through branches, directories,
files, and commits. The file tree, current branch, latest commit, path, and related pull
request state should remain easy to reach.

## Issues

Issues are repository-scoped work and discussion with numbering independent from pull requests.
`#12` refers to issue 12 and `!12` refers to pull request 12 in the current repository, so both
can exist without ambiguity. Issues support open and closed states, editable descriptions and
comments, durable deletion tombstones, assignees, repository labels, conversation locking, and a
complete actor-attributed timeline. Global Issues provides one searchable queue across every
repository the current user can read; repository Issues preserves label filtering and repository
context. Only repository triage roles manage assignment, labels, and locks, while issue authors
can edit and close their own work.

## Pull requests

Pull requests are Marl's flagship surface. A developer must be able to understand the
proposal, review every file, follow conversations, inspect checks, and identify every merge
blocker without hunting across unrelated screens.

A pull request moves from draft to ready and can be closed or reopened without losing its
review record. Its conversation includes replies, editable comments, durable deletion
tombstones, reversible thread resolution, and an owner-controlled conversation lock. Reviewers
start line or range conversations directly from the changes view; those conversations also
appear in the timeline with their exact file and line range, then collapse when resolved. Title,
description, lifecycle, lock, assignment, label, merge, and thread-resolution changes are durable
timeline events. The conversation composer keeps comment, review, every allowed merge method,
close, and reopen actions together without navigating away. Choosing an action makes it the
composer's primary submit behavior and includes the written comment when present. Assignees and
repository labels make ownership and triage visible without replacing review state. The commits,
changes, checks, and conversation views all describe the same pinned head revision.

Repository owners configure merge rules from the branches surface: required approvals,
successful checks, resolved conversations, stale-approval dismissal, and the allowed merge,
squash, or rebase methods. These rules are enforcement policy, not UI suggestions.

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
- Releases and package registries
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
