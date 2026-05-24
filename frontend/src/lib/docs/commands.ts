export type CommandRow = {
	command: string;
	description: string;
};

export type CommandGroup = {
	title: string;
	intro: string;
	rows: CommandRow[];
};

export const styCommandGroups: CommandGroup[] = [
	{
		title: 'Accounts and projects',
		intro: 'Use sty for account login, tenant setup, project creation, and repository connection. PIG handles most day-to-day VCS work after the remote is configured.',
		rows: [
			{ command: 'sty login', description: 'Sign in through Ave, create a sty session, and import the token into PIG.' },
			{ command: 'sty login --token <token>', description: 'Import an existing token without browser login.' },
			{ command: 'sty login --remote-url <url>', description: 'Advanced: sign in against an alternate compatible sty remote.' },
			{ command: 'sty whoami', description: 'Show the signed-in handle and configured remote.' },
			{ command: 'sty tenant new', description: 'Create an organization tenant interactively.' },
			{ command: 'sty tenant new --name <tenant>', description: 'Create an organization tenant without prompts.' },
			{ command: 'sty init', description: 'Choose a tenant, name the project, create or connect it, and add the PIG remote for the current repo.' },
			{ command: 'sty init <tenant>/<project>', description: 'Connect the current repo to an explicit target.' },
			{ command: 'sty init --tenant <tenant> --project <project>', description: 'Create or connect a project without prompts.' },
			{ command: 'sty init --tenant <tenant> --project mobile --folder product', description: 'Connect a repository and group it under a project folder in sty.' },
			{ command: 'sty clone <tenant>/<project> [path]', description: 'Download the current project files without forking or configuring a PIG remote.' },
			{ command: 'sty clone <tenant>/<project> --workspace <name>', description: 'Download files from a specific workspace.' },
			{ command: 'sty clone <tenant>/<project> --include src/parser', description: 'Download only one file or directory through the path-closure object API.' },
			{ command: 'sty clone <tenant>/<project> --snapshot <id>', description: 'Download files from a specific snapshot.' },
			{ command: 'sty project list', description: 'List projects visible to the signed-in user.' },
			{ command: 'sty project create --tenant <tenant> --project website --folder product', description: 'Create a grouped project without changing the current PIG remote.' }
		]
	},
	{
		title: 'Forks and contributions',
		intro: 'Fork public projects into your account, either as linked contribution forks or independent project copies.',
		rows: [
			{ command: 'sty fork <tenant>/<project>', description: 'Fork a public project interactively, choose linked or independent mode, and optionally sync this directory.' },
			{ command: 'sty fork <tenant>/<project> --tenant <tenant> --project <project> --mode contribute --yes', description: 'Create a linked contribution fork without prompts.' },
			{ command: 'sty fork <tenant>/<project> --tenant <tenant> --project <project> --mode detached --yes --no-sync', description: 'Copy a public project into your tenant and break the contribution link.' },
			{ command: 'sty sendwork', description: 'Sync the current fork workspace, prompt for title and message, and publish it to the parent project as ready work.' },
			{ command: 'sty sw --title "title" --message "message" --yes', description: 'Short form for sendwork without prompts.' }
		]
	},
	{
		title: 'Collaborators',
		intro: 'Tenant collaborators inherit access to every project in the tenant. Project collaborators affect one project.',
		rows: [
			{ command: 'sty tenant collaborators list <tenant>', description: 'List tenant collaborators.' },
			{ command: 'sty tenant collaborators add <tenant> <user> --role maintainer', description: 'Add a tenant collaborator.' },
			{ command: 'sty tenant collaborators update <tenant> <user> --role viewer', description: 'Change a tenant collaborator role.' },
			{ command: 'sty tenant collaborators remove <tenant> <user>', description: 'Remove inherited tenant access.' },
			{ command: 'sty project collaborators list <tenant>/<project>', description: 'List project collaborators.' },
			{ command: 'sty project collaborators add <tenant>/<project> <user> --role contributor', description: 'Grant project-only access.' },
			{ command: 'sty project collaborators update <tenant>/<project> <user> --role viewer', description: 'Change project-only access.' },
			{ command: 'sty project collaborators remove <tenant>/<project> <user>', description: 'Remove direct project access.' }
		]
	},
	{
		title: 'CI',
		intro: 'Sty owns CI configuration, runner tokens, and job history. PIG runs self-hosted jobs because it understands repository snapshots.',
		rows: [
			{ command: 'sty ci runner new <tenant>/<project> linux-builder', description: 'Create a project-scoped self-hosted CI runner token.' },
			{ command: 'sty ci runner new <tenant>/<project> linux-builder --concurrency 2', description: 'Allow a runner token to lease up to two jobs at once when multiple runner processes use it.' },
			{ command: 'sty ci runner list <tenant>/<project>', description: 'List active and disabled CI runners.' },
			{ command: 'sty ci runner delete <tenant>/<project> <runner-id>', description: 'Disable a runner token.' },
			{ command: 'sty ci jobs <tenant>/<project>', description: 'List recent CI jobs for the project.' },
			{ command: 'sty ci jobs <tenant>/<project> --workspace feature-auth', description: 'List CI jobs for one workspace.' },
			{ command: 'sty ci logs <tenant>/<project> <job-id>', description: 'Print uploaded logs for one CI job.' },
			{ command: 'sty ci artifacts <tenant>/<project> <job-id>', description: 'List files uploaded by one CI job.' },
			{ command: 'sty ci artifacts <tenant>/<project> <job-id> --download <artifact-id>', description: 'Download one CI artifact.' }
		]
	},
	{
		title: 'Leaves',
		intro: 'Leaves are lightweight docs/notes that can attach to tenants, projects, issues, workspaces, or releases.',
		rows: [
			{ command: 'sty leaf list <tenant> --tenant', description: 'List tenant leaves.' },
			{ command: 'sty leaf list <tenant>/<project>', description: 'List leaves attached to one project.' },
			{ command: 'sty leaf get <tenant> <slug> --tenant', description: 'Read one tenant leaf.' },
			{ command: 'sty leaf get <tenant>/<project> <slug>', description: 'Read one project leaf.' },
			{ command: 'sty leaf new <tenant> --tenant --title "Runbook"', description: 'Create a tenant-level leaf.' },
			{ command: 'sty leaf new <tenant>/<project> --title "Release notes"', description: 'Create a project leaf.' },
			{ command: 'sty leaf edit <tenant>/<project> <slug> --title "New title"', description: 'Update leaf metadata or body.' },
			{ command: 'sty leaf delete <tenant>/<project> <slug> --yes', description: 'Delete a leaf when you have access.' }
		]
	}
];

export const pigCommandGroups: CommandGroup[] = [
	{
		title: 'Local history',
		intro: 'PIG saves snapshots locally first. Human output is readable by default; add --json for agents.',
		rows: [
			{ command: 'pig status', description: 'Show the current workspace, changed files, and pending work.' },
			{ command: 'pig status --short', description: 'Show changed files as Git-style A/M/D lines.' },
			{ command: 'pig status --name-only', description: 'Print changed paths only.' },
			{ command: 'pig save "message"', description: 'Create a local snapshot with intent metadata.' },
			{ command: 'pig save --allow-secret-risk "message"', description: 'Create a snapshot after acknowledging a secret-scan warning.' },
			{ command: 'pig pack', description: 'Pack the current session into one shareable snapshot with an automatic message.' },
			{ command: 'pig pack 3', description: 'Pack the last three saves into one snapshot.' },
			{ command: 'pig pack 3 "message"', description: 'Pack the last three saves with an explicit message.' },
			{ command: 'pig pack 2 --force && pig sync --force', description: 'Rewrite already-synced local and remote save history intentionally.' },
			{ command: 'pig log', description: 'Show local snapshot history.' },
			{ command: 'pig stack', description: 'Show the current workspace save stack and pack suggestion.' },
			{ command: 'pig op log', description: 'Show local VCS operations that changed metadata or history.' },
			{ command: 'pig op undo [operation-id]', description: 'Undo a local operation without creating a new content snapshot.' },
			{ command: 'pig diff [left] [right]', description: 'Compare snapshots or the working tree.' },
			{ command: 'pig diff --stat', description: 'Show Git-style file stats for current changes.' },
			{ command: 'pig diff --name-only', description: 'Print changed paths only.' },
			{ command: 'pig undo [snapshot|path]', description: 'Restore a snapshot or file path.' },
			{ command: 'pig query "text"', description: 'Search local history semantically.' },
			{ command: 'pig suggest-save', description: 'Ask PIG for a save message from current changes.' },
			{ command: 'pig doctor && pig fsck', description: 'Inspect repository health and validate reachable objects.' },
			{ command: 'pig gc', description: 'Preview unreachable local object cleanup.' },
			{ command: 'pig gc --force', description: 'Remove unreachable local objects after fsck passes.' }
		]
	},
	{
		title: 'Workspaces',
		intro: 'Workspaces replace branch juggling. An isolated workspace creates a separate working folder for parallel agents or features.',
		rows: [
			{ command: 'pig work list', description: 'List local workspaces.' },
			{ command: 'pig work status', description: 'Show the current workspace state.' },
			{ command: 'pig work new <name>', description: 'Create a workspace from the current workspace head.' },
			{ command: 'pig work new <name> --from <workspace>', description: 'Create a workspace from another workspace.' },
			{ command: 'pig work new <name> --from-snapshot <id>', description: 'Create a workspace from an older snapshot.' },
			{ command: 'pig work new <name> --isolated', description: 'Create the workspace in a separate folder while respecting .gitignore and .oink ignores.' },
			{ command: 'pig work switch <name>', description: 'Switch the current folder to another workspace.' },
			{ command: 'pig work move [name] --onto <workspace|snapshot>', description: 'Move a child workspace onto a newer workspace or snapshot base.' },
			{ command: 'pig work ready [name]', description: 'Mark work ready for review. PIG can prompt to pack first.' },
			{ command: 'pig work merge <name>', description: 'Merge a local workspace into the current workspace.' },
			{ command: 'pig resolve <attempt-id>', description: 'Open the terminal conflict resolver for an open merge attempt.' },
			{ command: 'pig resolve <attempt-id> <path> --parent', description: 'Resolve one conflict by taking the parent side.' },
			{ command: 'pig resolve <attempt-id> <path> --incoming', description: 'Resolve one conflict by taking the incoming side.' },
			{ command: 'pig resolve <attempt-id> <path> --manual <file>', description: 'Resolve one conflict using file content you provide.' },
			{ command: 'pig resolve <attempt-id> [path] --reuse', description: 'Apply a previously recorded resolution for the same conflict shape.' },
			{ command: 'pig resolve <attempt-id> --finalize', description: 'Finalize a merge after every conflict has a choice.' }
		]
	},
	{
		title: 'Remote sync',
		intro: 'Sync moves immutable objects and workspace heads between PIG and a sty-compatible remote.',
		rows: [
			{ command: 'pig remote add <tenant>/<project> --remote-url <url>', description: 'Attach the current repo to a remote project.' },
			{ command: 'pig remote show', description: 'Show the configured remote target and URL.' },
			{ command: 'pig auth status', description: 'Check whether a remote token is stored.' },
			{ command: 'pig auth import <url> --token-stdin', description: 'Import a token from another tool without printing it.' },
			{ command: 'pig auth logout', description: 'Remove stored remote auth.' },
			{ command: 'pig sync', description: 'Upload missing objects, compare heads, push or pull, and resolve conflicts when needed.' },
			{ command: 'pig sync --force', description: 'Preview and replace the remote workspace head with the local head.' },
			{ command: 'pig fetch path src/parser', description: 'Fetch and hydrate only one remote file or directory.' },
			{ command: 'pig fetch path src/parser --no-hydrate', description: 'Cache the remote path object closure without writing files.' },
			{ command: 'pig fetch path src/parser --snapshot <id>', description: 'Fetch one path from a specific reachable remote snapshot.' },
			{ command: 'pig remote prune', description: 'Remove stale local remote-object cache entries.' },
			{ command: 'pig repos list', description: 'List cached top-level child repositories when the current folder is a repo group.' },
			{ command: 'pig repos refresh', description: 'Refresh the top-level child repository cache stored in the root .pig directory.' },
			{ command: 'pig capabilities', description: 'Show the features advertised by the connected remote.' }
		]
	},
	{
		title: 'Issues and review',
		intro: 'Remote protocol commands work only when the connected remote advertises the matching capability.',
		rows: [
			{ command: 'pig issue list --label bug --assignee kristof', description: 'List issues with filters and pagination.' },
			{ command: 'pig issue new "title" -b "body" --label bug', description: 'Create an issue.' },
			{ command: 'pig issue view <id>', description: 'Show one issue.' },
			{ command: 'pig issue close <id>', description: 'Close an issue.' },
			{ command: 'pig issue reopen <id>', description: 'Reopen an issue.' },
			{ command: 'pig issue assign <id> <user>', description: 'Assign an issue to a valid collaborator.' },
			{ command: 'pig issue label <id> <label>', description: 'Add a label to an issue.' },
			{ command: 'pig comment list --target-type workspace --target-id <workspace>', description: 'List project comments for a target.' },
			{ command: 'pig comment new "message" --file src/app.ts --line 42', description: 'Create a workspace/file/line comment.' },
			{ command: 'pig label list', description: 'List project labels.' },
			{ command: 'pig label new bug --color "#d96c6c"', description: 'Create a project label.' },
			{ command: 'pig milestone list', description: 'List milestones.' },
			{ command: 'pig milestone new "v1" --due 2026-06-01', description: 'Create a milestone.' }
		]
	},
	{
		title: 'Releases, hooks, and automation',
		intro: 'These commands are useful for release tooling, deployment systems, and notification flows.',
		rows: [
			{ command: 'pig release list', description: 'List release entries.' },
			{ command: 'pig release new <tag> --name "v1" --notes "..."', description: 'Create a release from the latest source snapshot.' },
			{ command: 'pig release view <tag>', description: 'Show release details and artifacts.' },
			{ command: 'pig hook list', description: 'List project protocol hooks.' },
			{ command: 'pig hook new <event> <url>', description: 'Create a protocol hook when supported by the remote.' },
			{ command: 'pig webhook list', description: 'List project webhooks.' },
			{ command: 'pig webhook new <event> <url>', description: 'Create a webhook for a project event.' },
			{ command: 'pig webhook test <id>', description: 'Send a test webhook delivery.' },
			{ command: 'sty ci runner new <tenant>/<project> linux-builder', description: 'Create a project-scoped self-hosted CI runner token.' },
			{ command: 'STY_CI_TOKEN=<token> pig ci run', description: 'Wait for CI wakeups, claim leased jobs, run commands in temp checkouts, restore/save file or directory caches, and upload logs, artifacts, and results.' },
			{ command: 'pig ci run --once --project <tenant>/<project> --remote-url <url> --token-stdin', description: 'Run one CI claim cycle without relying on saved repo auth.' },
			{ command: 'pig ci run --no-websocket --interval 60 --max-interval 300', description: 'Run with adaptive polling only.' },
			{ command: 'pig follow', description: 'Follow a public project for release feed updates.' },
			{ command: 'pig unfollow', description: 'Stop following the project.' }
		]
	},
	{
		title: 'Stash and signing',
		intro: 'Stash is local. Signing keys are user-scoped and can use local key material or a system SSH agent.',
		rows: [
			{ command: 'pig stash "message"', description: 'Store current working-tree changes without saving a snapshot.' },
			{ command: 'pig stash-list', description: 'List local stashes.' },
			{ command: 'pig unstash [id]', description: 'Apply a stash, defaulting to the latest one.' },
			{ command: 'pig signing generate --name laptop', description: 'Generate an Ed25519 signing key for snapshots.' },
			{ command: 'pig signing agent --name laptop --key <public-key>', description: 'Use a key from the system SSH agent, including 1Password-backed agents.' },
			{ command: 'pig signing upload', description: 'Register the signing key after browser approval.' },
			{ command: 'pig signing disable', description: 'Stop signing new snapshots without deleting the configured key.' },
			{ command: 'pig signing enable', description: 'Resume signing new snapshots.' },
			{ command: 'pig snapshot verify <id>', description: 'Verify one signed snapshot remotely.' },
			{ command: 'pig snapshot verify --all', description: 'Verify every uploaded snapshot.' },
			{ command: 'pig ssh list', description: 'List account SSH keys stored on the remote.' },
			{ command: 'pig ssh add <public-key>', description: 'Upload an account SSH key.' },
			{ command: 'pig ssh delete <key-id>', description: 'Delete an account SSH key.' }
		]
	}
];
