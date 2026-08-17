# Self-hosted runners

Sty runs jobs only on machines you connect. A runner belongs to one organization and can
read repositories in that organization. It never receives write access to Git.

## Connect a runner

Install Git and Docker Engine, then create a one-time enrollment token from
**Runners -> Connect runner**. Run the command shown there on the machine that will execute
jobs:

```powershell
sty runner register --url https://sty.sh --token <enrollment-token> --name build-01 --label x86_64
```

Registration verifies the Docker daemon and automatically adds the `docker` label. It writes
a runner credential to the platform config directory, restricted to the current user and
the operating-system service account. Enrollment tokens expire and can be used only once.

Run interactively while setting the machine up:

```powershell
sty runner run
```

Install it with automatic restart once the configuration is correct:

```powershell
sty runner service install
sty runner service status
```

Service installation supports Windows Service Control Manager and Linux systemd. It needs
administrator or root access because it creates a system service.

## Workflow files

Sty reads native workflows from `.sty/workflows/*.yml` and compatible GitHub Actions
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

The repository Runs tab lists workflow definitions from the default branch and keeps each
workflow's run history together. A **Run workflow** action is available only when the file
declares `workflow_dispatch`; Sty does not accept arbitrary commands from the Runs UI.

The GitHub workflow reader supports `runs-on`, `needs`, simple strategy matrices with
`include` and `exclude`, `container`, service images and environments, job and step
environments, timeouts, working directories, continue-on-error, `actions/checkout`, and
`actions/upload-artifact`. Windows and macOS hosted images and arbitrary Marketplace
`uses:` actions are rejected with a workflow warning; Sty never reports an unsupported
action as successful.

Environment values in workflow files are ordinary repository content. Secret storage and
secret injection are not implemented yet, so credentials must not be committed there.

## Execution model

The runner clones the exact commit without executing repository code on the host. It then
creates a private Docker network, starts declared service containers, and executes every
job step in one disposable job container. The checkout and repository-scoped cache are the
only host directories mounted into that container.

Job containers drop Linux capabilities, enable `no-new-privileges`, and receive CPU,
memory, and process limits. The runner coalesces small output into bounded log chunks and sends
new frames through a per-job hibernating realtime room. Cursor-paged object-storage logs remain
authoritative for reconnects and completed runs. Cancellation and timeout kill the entire job
container. Artifact paths are relative to the checkout; symlinks and paths outside the workspace
are refused. Artifacts use size-negotiated, lease-renewed multipart uploads directly to object
storage. Job containers and networks are removed after every attempt, while the repository cache
survives.

Docker is the security boundary for job execution, but a Docker daemon is still privileged
infrastructure. Keep runner administration narrow, do not mount the Docker socket into job
containers, and use dedicated runner machines for repositories that accept untrusted code.
