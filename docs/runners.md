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
artifacts, runner labels, and push branch filters.

Push runs are superseded by a newer push of the same workflow on the same branch. Marl cancels
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
