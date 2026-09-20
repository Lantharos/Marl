# Self-hosted runners

Marl runs jobs only on machines you connect. A runner belongs to one organization and can
read repositories in that organization. It never receives write access to Git.

## Connect a runner

Install Git and Docker Engine, then create a one-time enrollment token from
**Runners -> Connect runner**. Run the command shown there on the machine that will execute
jobs:

```powershell
marl runner register --url https://marl.sh --token <enrollment-token> --name build-01 --label x86_64
```

Registration verifies the Docker daemon and automatically adds the `docker` label. It writes
a runner credential to the platform config directory, restricted to the current user and
the operating-system service account. Enrollment tokens expire and can be used only once.

Run interactively while setting the machine up:

```powershell
marl runner run
```

Install it with automatic restart once the configuration is correct:

```powershell
marl runner service install
marl runner service status
```

Service installation supports Windows Service Control Manager and Linux systemd. It needs
administrator or root access because it creates a system service.

## Workflow files

Marl reads native workflows from `.marl/workflows/*.yml` and compatible GitHub Actions
workflows from `.github/workflows/*.yml`. A workflow runs from the exact commit that
contained its configuration.

```yaml
name: Verify

on:
  push:
    branches: [main, release/*]
  workflow_dispatch:

jobs:
  check:
    name: Check and test
    labels: [docker]
    needs: []
    timeoutMinutes: 30
    runtime:
      image: oven/bun:1
      services:
        - name: postgres
          image: postgres:17
          environment:
            POSTGRES_PASSWORD: local-test
    steps:
      - name: Install
        shell: bash
        run: bun install --frozen-lockfile
      - name: Verify
        shell: bash
        run: bun check && bun test
    artifacts: [reports/results.xml]
```

Native workflows support job dependencies, per-job Docker images, service containers,
job and step timeouts, step working directories, continue-on-error, environment values,
artifacts, runner labels, and branch filters for `push` and `pull_request`.

Pull workflows use `on: pull_request`, or a `pull_request` entry alongside other triggers.
Their branch filters match the target branch. Marl reads the workflow definition from that
branch and checks out the pull's exact source commit, including contributions from a fork.
Draft pulls wait until marked ready. Each workflow runs once per pull head; an authorized retry
can run it again.

Repository settings can require permission before checks run on outside contributions.
Contributors with push access to the target repository are trusted; direct pushes and trusted
contributors' pulls run normally. If the author or the person pushing the current pull head lacks
that access, automatic pull checks wait for someone with target-repository push access to approve
them from the pull or run page. Permission applies to that exact head and is separate from code
review approval. Carried-forward reviews do not authorize compute for a new outside head.
Waiting jobs cannot be claimed by runners.

This permission gate applies to pull checks in the target repository, not ordinary pushes to
a fork. A fork's push workflows use runners belonging to the fork's organization. Opening a pull
does not move those push runs to the upstream runner pool; it creates separate pull checks there.

Outside-contribution jobs do not receive repository or organization secrets and cannot publish
releases, even after execution is approved. A runner can read a fork outside its organization
only while it holds an active job lease for that checkout.

Automatic push and pull runs are superseded by a newer head of the same workflow and branch
(scoped to the same pull for pull workflows). Marl cancels
both queued jobs and an in-progress stale run so an offline runner processes only the newest
revision when it returns. Manual dispatches and retries are never superseded. Set
`supersede: false` at the top level of a native workflow when every push must run. GitHub
workflows can opt out with `concurrency.cancel-in-progress: false`.

The repository Runs tab lists workflow definitions from the default branch and keeps each
workflow's run history together. A **Run workflow** action is available only when the file
declares `workflow_dispatch`; Marl does not accept arbitrary commands from the Runs UI.

The GitHub workflow reader supports `runs-on`, `needs`, simple strategy matrices with
`include` and `exclude`, `container`, service images and environments, job and step
environments, timeouts, working directories, continue-on-error, `actions/checkout`, and
`actions/upload-artifact`. Windows and macOS hosted images and arbitrary Marketplace
`uses:` actions are rejected with a workflow warning; Marl never reports an unsupported
action as successful.

`marl/release@v1` publishes the exact successful job commit and promotes matching workspace
files into durable release assets. The release declaration is stored with the leased job, so a
runner cannot choose another tag, commit, or repository. If an asset upload or release publish
fails, the job fails instead of exposing a partial published release.

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun run build
      - uses: marl/release@v1
        with:
          tag: v1.4.0
          name: Marl 1.4.0
          body: Production release built by Marl.
          files: |
            dist/*.tar.gz
            dist/checksums.txt
```

Native workflows can use the equivalent `release` object on a job with `tag`, `name`, `body`,
`files`, `draft`, `prerelease`, and `makeLatest` fields. Release files also remain visible as
ordinary run artifacts; Marl copies them to release-owned R2 keys so deleting a release cannot
break the run record.

Environment values in workflow files are ordinary repository content and must not contain
credentials. Organization administrators can define shared CI secrets, and repository
administrators can define repository-specific values. Repository values override organization
values with the same name. Marl encrypts every value with AES-256-GCM, binds its ciphertext to
the owning scope and name, and only decrypts it when a runner successfully leases a job.

Secrets are injected as environment variables. The runner masks their exact values before every
log upload, including live frames and persisted chunks. Values are never returned by list APIs or
shown again in settings. Changing or deleting a secret requires a fresh administrator session and
is written to the audit log.

## Execution model

The runner clones the exact commit without executing repository code on the host. It then
creates a private Docker network, starts declared service containers, and executes every
job step in one disposable job container. The checkout and repository-scoped cache are the
only host directories mounted into that container.

Job and service containers drop Linux capabilities and enable `no-new-privileges`. Each job
container is limited to 2 CPUs, 4 GiB of memory, and 512 processes; each declared service is
limited to 1 CPU, 1 GiB of memory, and 256 processes. On Unix hosts, job steps use the runner
account's numeric user and group with a disposable container home, keeping the checkout and cache
writable without granting filesystem-bypass capabilities. The runner coalesces small output into
log chunks no larger than 1 MiB and sends new frames through a per-job hibernating realtime room.
Persisted logs are capped at 64 MiB per job. Cursor-paged object-storage logs remain authoritative
for reconnects and completed runs.
Cancellation and timeout kill the entire job
container. Artifact paths are relative to the checkout; symlinks and paths outside the workspace
are refused. Completed artifacts and in-flight artifact reservations share a 2 GiB and 4,096-file
per-job limit. Logs also have a 65,536-chunk ceiling so tiny writes cannot grow metadata without
bound.
Artifacts use size-negotiated, lease-renewed 16 MiB multipart uploads directly to object storage.
Job containers and networks are removed after every attempt, while the repository cache survives.

Docker is the security boundary for job execution, but a Docker daemon is still privileged
infrastructure. Keep runner administration narrow, do not mount the Docker socket into job
containers, and use dedicated runner machines for repositories that accept untrusted code.
