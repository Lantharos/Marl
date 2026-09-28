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

See [Interface principles](interface.md) for visual hierarchy, grouping, and interaction guidance.

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

- Overview
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

New accounts see a short setup checklist beside their repositories: create or import a
repository, push a first commit, invite a collaborator, open a pull, and connect a runner. Steps
tick themselves off from real activity, and the checklist disappears when everything is done or
when it is hidden.

## Inbox

Inbox answers one question: what changed that is relevant to me? It contains direct mentions,
current issue and pull assignments, new activity on work the user authored or joined, and
failed workflow runs triggered by that user. Read state and done state are personal and durable;
newer activity moves a finished item back into the Inbox. Home previews the newest active items,
while the full Inbox separates active, unread, and done work.

Repository membership alone never subscribes someone to every event. Marl only adds an item when
it can explain the direct relationship between the user and the work.

Email follows the same rules. Unread Inbox items are emailed about ten minutes after they appear,
or once a day as a summary, and people choose which kinds of activity to email. A bell on each
repository limits it to mentions or ignores it entirely. Every notification email has a one-click
unsubscribe link; account and security email is sent regardless.

## Code

Code browsing must preserve repository context while moving through branches, directories,
files, and commits. The file tree, current branch, latest commit, path, and related pull state
should remain easy to reach.

Code search looks through every text file on a branch as it is now, with optional case matching
and regular expressions. `path:`, `lang:`, and `ext:` narrow the files, and a pattern wrapped in
slashes is treated as a regular expression. When the search is a name defined in the default
branch, its definitions are listed first. Global search also finds functions, types, and other
definitions across every repository the person can read.

## Issues

Issues are repository-scoped work and discussion with numbering independent from pulls.
`#12` refers to issue 12 and `!12` refers to pull 12 in the current repository, so both
can exist without ambiguity. Issues support open and closed states, editable descriptions and
comments, durable deletion tombstones, assignees, repository labels, conversation locking, and a
complete actor-attributed timeline. Global Issues provides one searchable queue across every
repository the current user can read; repository Issues preserves label filtering and repository
context. Lists offer unanswered, following, and unread discussion filters. Unanswered means nobody
other than the author has replied; assignments and comment counts do not imply workflow states.
The opening report and chronological discussion occupy the main column, with one level of grouped
replies. Long reports expand in place. Labels, assignees, linked pulls, and an optional conclusion
sit alongside the conversation. Maintainers and owners can write a conclusion or promote a comment,
preserving a link to its source without replacing the original report. Link a pull searches existing pulls
in the same repository; the issue author and repository triage roles can add a link without
editing the report. These explicit links remain when the report changes and do not close
the issue automatically. Only repository triage roles manage
assignment, labels, and locks, while issue authors
can edit and close their own work. References in descriptions, comments, reviews, and review
conversations create durable links and backlink timeline entries. References may use the current
repository shorthand or a qualified form such as `lantharos/marl#12` and `lantharos/marl!7`.
Authored discussion uses restrained surfaces so comment boundaries and reply groups remain easy to
scan; mechanical changes remain in expandable history. Read position and following are stored per
user. Resume returns to unread discussion, while Latest jumps to the end. Following also includes
the issue in the inbox. Draft replies stay with their conversation in the current browser tab.

Descriptions, comments, and review conversations accept pasted, dropped, or attached images and
videos. Images open at full size; videos have explicit playback controls and do not autoplay.
PNG, JPEG, GIF, and WebP uploads allow 10 MiB per image; MP4 and WebM allow 50 MiB per video, with
a rolling 250 MiB daily allowance per user. Codec playback depends on the browser; MP4 with H.264
and WebM are the supported upload containers. Uploads stream to object storage with size and file
signature checks. Every attachment read rechecks repository access, including byte-range video
requests; private media is never served from a public cache. Uploaded files belong to the repository,
and removing their Markdown reference does not delete the stored file.

## Writing

Every comment box offers the person's saved replies, inserted at the cursor from the toolbar or
with Ctrl . and managed in account settings. A new issue or pull starts from the repository's
template when the default branch has one: `.marl/issue_template.md` and `.marl/pull_template.md`,
or the GitHub locations for `issue_template.md` and `pull_request_template.md`. Changing the
repository swaps the template unless the description was already edited.

## Pulls

Pulls are Marl's flagship surface. The open queue is organized by the next useful action instead
of chronology alone: ready to land, needing attention, in review, or still taking shape. A
developer must be able to understand the proposal, review every file, follow conversations,
inspect checks, and identify every merge blocker without hunting across unrelated screens.

A pull moves from draft to ready and can be closed or reopened without losing its review record.
Its desktop view keeps the title, brief, current status, assignees, labels, and lifecycle actions
in a left-hand summary, with revision history and discussion on the right. Small screens stack
the summary above the discussion and disclose metadata on demand. One status describes the current
outcome; merge requirements are available when needed. Conflicts are checked against the exact
source and target commits without delaying the initial page. The
latest revision and composer appear first. Earlier revisions stay collapsed until opened, with
their review outcome and discussion count visible in the header. Each revision's top-level
activity runs newest-first; replies inside a conversation read in order. Code excerpts scroll
horizontally when needed so a narrow screen does not hide part of a reviewed line.
Pushes before anyone comments or reviews stay in the same revision, with a compact commit update.
Once discussion begins, the next push starts a revision and preserves that discussion with its head.

A branch rule can send merges through a merge queue. A ready pull is added to the queue instead of
merging, and queued pulls land one at a time in the order they were added. When the branch has
required checks, each pull is merged on top of the latest branch in a temporary `marl-queue/`
branch, the workflows that produce those checks run on that exact result, and the branch moves only
if they pass. A pull leaves the queue with a reason on its timeline when a check fails, it
conflicts, or new commits arrive. The queue for a branch is listed under its pulls.

Activity includes replies, editable comments, durable deletion
tombstones, reversible thread resolution, and an owner-controlled conversation lock. Reviewers
start line or range conversations directly from the changes view; those conversations also
appear in the timeline with their exact file, line range, and a capped excerpt of the relevant code,
then collapse when resolved. Each review, comment, and line conversation is visually contained while
commit and metadata events remain compact. Title,
description, lifecycle, lock, assignment, label, and merge changes are durable timeline events.
Only repository maintainers and owners can resolve or reopen line conversations; these changes
update the thread and merge requirements live without adding activity rows. Authors can delete
their own comments, and maintainers can delete comments across the pull. Deleting a review summary
removes its text, not its decision or line conversations.
The composer combines comments with approval or requested changes. Merge, close, reopen, and
ready-for-review actions live beside the summary and never submit an unfinished comment. Assignees and
repository labels make ownership and triage visible without replacing review state. The commits,
changes, checks, and overview views all describe the same pinned head revision.

A pull that targets another open pull's branch is part of a stack. Its summary links the pull it
builds on and the pulls that build on it. When the base pull merges, every pull built on it is
retargeted to the base's target branch and records the change in its timeline.

A reviewer who returns after new commits can switch the changes view to show only what changed
since their last review. Marl compares the reviewed revision directly with the current head and
limits the result to files the pull touches, so a rebase does not bury the new work.

Reviews can be driven from the keyboard: number keys switch between overview, changes, commits,
and checks; J and K move between changed files; N and P move between open conversations; C starts
a comment and R opens the review. Pressing ? anywhere lists every shortcut.

Pull descriptions can close linked issues with `fixes`, `closes`, or `resolves`. Closing
occurs atomically with a successful merge into the repository's default branch; merging into any
other branch preserves the link without changing issue state.

Repository owners configure merge rules from the branches surface: required approvals,
successful checks, resolved conversations, and the allowed merge, squash, or rebase methods.
Approvals apply to the reviewed revision by default. An optional carry-forward setting copies each
reviewer's latest approval onto the next head and records whose approval was carried forward in
that revision's timeline. Requested changes never carry forward as approval.

An optional author-merge setting lets a pull's author merge when the approval threshold is met,
every reported check passes, and the remaining merge rules are satisfied. The approval threshold
can be zero. Author merge does not grant push access or permission to approve check execution.
These rules are enforced by the server.

Branches can be deleted from the branch list by contributors with push access. Deletion needs
confirmation and checks the expected head commit. Default branches, branches covered by protection
rules, and branches still used by open pulls cannot be deleted. Git publishes the ref removal before
its derived branch index changes; pull history retains its pinned commits.

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

## Imports

Importing from GitHub copies a repository's branches, tags, and pull heads, then its labels,
pulls with their reviews and line comments, issues, conversation comments, and releases with their
files, keeping original numbers and dates. People who are not on Marl appear under their GitHub
username without a profile; work by the person who started the import is attributed to their
account. Pulls from forks keep their origin and the commit they proposed, so they can be reviewed
and merged as they are; they cannot receive new commits. Line comments on closed and merged pulls
arrive resolved.

## Integrations

Repository and organization webhooks send push, pull, review, issue, comment, release, and run
events. JSON payloads are signed with a shared secret; Slack and Discord formats deliver a readable
message instead. Failed deliveries retry with increasing delays, and settings show recent
deliveries with the response each endpoint returned.

## Agents

Agents are accounts for bots and AI tools. An organization or person creates them, issues their
tokens, and adds them to repositories like any collaborator. Agents never sign in, their profile
names who operates them, and everything they write carries an agent marker so readers can tell
automated work apart.

## Accounts, safety, and data

Signing up requires accepting the Terms of Service and Privacy Policy, and Marl records the
version each person accepted; when the policies change, people accept the new version before
continuing. Anyone can download a copy of their data or delete their account from settings.

Repositories, issues, pulls, comments, and accounts can be reported. Staff review reports in a
moderation queue and can remove comments, disable repositories, or suspend accounts. A disabled
repository shows its reason instead of its content.

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
