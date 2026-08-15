# Self-hosted runners

Sty runs jobs only on machines you connect. A runner belongs to one organization and can
read repositories in that organization. It never receives write access to Git.

## Connect a runner

Create a one-time enrollment token from **Runners → Connect runner**, then run the command
shown there on the machine that will execute jobs:

```powershell
sty runner register --url https://sty.sh --token <enrollment-token> --name build-windows --label windows --label x86_64
```

The command writes a runner credential to the platform config directory. The file is
restricted to the current user and the operating-system service account. Enrollment tokens
expire and can be used only once.

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

## Repository workflows

Push workflows live in `.sty/workflows` and use YAML. A workflow runs from the exact commit
that contained its configuration.

```yaml
name: Verify

on:
  push:
    branches:
      - main
      - release/*

jobs:
  check:
    name: Check and test
    labels:
      - windows
    environment:
      CI_MODE: full
    steps:
      - name: Install
        shell: powershell
        run: bun install --frozen-lockfile
      - name: Verify
        shell: powershell
        run: bun check && bun test
    artifacts:
      - reports/results.xml
```

`on.push.branches` accepts exact names and `*` wildcards. Omitting `branches` matches every
branch. Job labels must all exist on a runner before it can claim the job. Supported shells
are `powershell`, `pwsh`, `cmd`, `sh`, and `bash`.

Environment values in workflow files are ordinary repository content. Secret storage and
secret injection are not implemented yet, so credentials must not be committed there.

## Execution model

Each job gets a clean checkout at its exact commit. Jobs on one runner can execute
concurrently up to the runner's configured capacity. `STY_CACHE_DIR` points to a persistent
cache scoped to the repository; job workspaces themselves are replaced for every attempt.

Logs stream in chunks while a step runs. Cancellation terminates the child process tree,
and retries create a new run instead of rewriting history. Artifact paths are relative to
the checkout; symlinks and paths outside the workspace are refused.

## Trust boundary

A self-hosted job executes with the operating-system authority of the runner service. Code
from an untrusted branch can read anything that account can read and can modify anything it
can write. Use a dedicated account or dedicated machine, keep its permissions narrow, and
do not attach a privileged runner to repositories that accept untrusted code.
