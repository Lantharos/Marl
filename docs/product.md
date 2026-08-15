# Sty product contract

## Purpose

Sty is the daily workspace for hosting code, reviewing changes, and running checks on
self-hosted machines. It should be comfortable enough to remain open all day and precise
enough that developers can understand the state of their work without reconstructing it
from several pages.

Sty is one product. The local repository engine, CLI, hosted application, API, and runner
are implementation parts of Sty, not separately branded products.

## Primary loop

Every product decision must improve this loop:

1. Create or switch to a line of work.
2. Save a meaningful revision.
3. Push it to Sty.
4. Open a pull request.
5. Review code and discuss specific lines.
6. Run required checks on self-hosted runners.
7. Resolve blockers and merge.

If a feature does not materially improve this loop, it does not belong in the initial
product.

## Vocabulary

The public vocabulary is deliberately familiar:

| Term | Meaning |
| --- | --- |
| Repository | One codebase and its revision history. |
| Branch | A named line of work. |
| Commit | A saved revision. |
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
- Pull requests
- Runs
- Repositories
- Runners

A repository contains:

- Code
- Pull requests
- Runs
- Settings

Settings is administrative. It must never become a bucket for primary workflows.

## Home

Home answers one question: what needs my attention?

It prioritizes requested reviews, blocked pull requests, failed runs, active work, and
unhealthy runners. Generic activity, vanity metrics, social feeds, and discovery do not
belong here.

## Code

Code browsing must preserve repository context while moving through branches, directories,
files, and commits. The file tree, current branch, latest commit, path, and related pull
request state should remain easy to reach.

## Pull requests

Pull requests are Sty's flagship surface. A developer must be able to understand the
proposal, review every file, follow conversations, inspect checks, and identify every merge
blocker without hunting across unrelated screens.

## Runs and runners

Runs expose queue time, execution time, job dependencies, live logs, runner identity,
cancellation, retry, and artifacts. A waiting job explains which runner labels it requires.

Runners are always self-hosted. Sty does not imply that hosted execution is available or
planned.

## Explicitly deferred

- Issues
- Leaves
- Gallery and screenshots
- Social following
- Contribution graphs
- Public discovery
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
- Sty can use the feature in its own development workflow where applicable.
