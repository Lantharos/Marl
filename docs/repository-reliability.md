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

Creating a pull request pins its base and head commits as hidden Git refs. If the pin response
is lost, retrying creation repairs the same refs and returns the existing pull request. This
keeps review inputs reachable through branch force-pushes and pack compaction.

Merges use the pull-request ID as their operation identity. A retry recognizes either the
same fast-forward or the merge commit carrying that identity, even if the target branch has
advanced again. D1 is updated after Git and never moves its derived branch row behind the
target head reported by Git.

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
force-with-lease rejection, fast-forward and merge-commit PR merges, retry after a deliberately
lost publication response, compaction, and `git fsck --strict` on a fresh clone. Unit tests and
the Windows local Rust gateway do not replace this staging test.
