# Repository reliability

Sty treats a successful push or merge response as an acknowledgement that the new refs and
every object reachable from them have been durably published. Derived branch rows, commit
indexes, usage totals, and UI state may converge afterward; none of them can make an
acknowledged Git generation disappear.

## Publication invariants

- Uploads are untrusted quarantine objects. Only packs accepted by `git index-pack --strict`,
  graph validation, size limits, and ref validation are promoted to content-addressed
  canonical keys.
- Canonical pack and index objects are written and checked before an immutable manifest is
  written. The repository Durable Object then performs the single authoritative generation
  and ref transition.
- Every transition leaves a durable commit record. A missing HTTP response is an unknown
  result, never permission to delete data. The publisher and upload-session alarm reconcile
  the commit record before cleanup.
- Organization quota settlement is idempotent and deliberately occurs after repository
  correctness. Accounting failure cannot roll back published refs.
- Compaction uses the same publication protocol. Old generations are retired only after a
  grace period, and failed or retention-locked deletions remain scheduled until they succeed.
- A repository alarm verifies the active manifest hash and contents plus the presence and
  stored size of every active pack and index each day. Failures retry indefinitely with
  bounded backoff and remain visible in Worker logs.

## Pull requests

Creating a pull request pins its base and head commits as hidden Git refs. Every later source
branch push moves the current review head with compare-and-swap while retaining immutable refs
for each reviewed base and head revision. If a pin response is lost, retrying repairs the same
refs before the relational pull-request head advances. This keeps every review input reachable
through branch force-pushes and pack compaction.

Merge, squash, and rebase operations use the pull-request ID as their operation identity. A
retry recognizes the already-published result for that method even if the HTTP response was
lost or the target branch later advanced. The target ref changes with compare-and-swap only
after the complete result exists. D1 is updated after Git and never moves its derived branch
row behind the target head reported by Git.

Merge rules are evaluated on the server against the current source commit immediately before
publication. Required approvals exclude the pull-request author, stale approvals can be
dismissed when the head changes, required checks must be complete and successful, and current
review conversations must be resolved. The UI presents the same authoritative reasons but
cannot bypass them.

## Required production configuration

The `sty-git-repositories` R2 bucket must have a bucket-lock rule for the `repositories/`
prefix. Start with a 30-day retention period. Do not lock `quarantine/`; abandoned uploads
must remain removable. Retention turns an application bug or compromised delete credential
into recoverable storage rather than immediate code loss. Configure and verify this rule in
every production account before accepting repositories.

Keep D1 Time Travel available for control-plane recovery and restrict production credentials
so the Git Worker can access only its repository bucket and bindings. Alert on repository
integrity failures, repeated publication reconciliation, compaction retirement failures, and
upload sessions that require alarm recovery.

Before a storage release, exercise the complete Worker, R2, Durable Object, and Container
topology from Linux or WSL. The release gate must cover clone, fetch, ordinary push,
force-with-lease rejection, merge/squash/rebase PR publication, retry after a deliberately
lost publication response, branch-head synchronization, compaction, and `git fsck --strict`
on a fresh clone. Unit tests and the Windows local Rust gateway do not replace this staging
test.
