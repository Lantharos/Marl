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
		intro: 'Use sty for identity, tenant setup, project creation, and collaborator access.',
		rows: [
			{ command: 'sty login', description: 'Sign in through Ave, create a sty session, and import the token into PIG.' },
			{ command: 'sty login --remote-url <url>', description: 'Advanced: sign in against an alternate compatible sty remote.' },
			{ command: 'sty whoami', description: 'Show the signed-in handle and configured remote.' },
			{ command: 'sty tenant new <tenant>', description: 'Create an organization tenant before initializing projects under it.' },
			{ command: 'sty init <tenant>/<project>', description: 'Create or connect a project and add the PIG remote for the current repo.' },
			{ command: 'sty project list', description: 'List projects visible to the signed-in user.' },
			{ command: 'sty project create <tenant>/<project>', description: 'Create the project without changing the current PIG remote.' }
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
			{ command: 'sty project collaborators add <tenant>/<project> <user> --role contributor', description: 'Grant project-only access.' }
		]
	}
];

export const pigCommandGroups: CommandGroup[] = [
	{
		title: 'Local history',
		intro: 'PIG saves snapshots locally first. Human output is readable by default; add --json for agents.',
		rows: [
			{ command: 'pig status', description: 'Show the current workspace, changed files, and pending work.' },
			{ command: 'pig save "message"', description: 'Create a local snapshot with intent metadata.' },
			{ command: 'pig cram "message"', description: 'Squash local saves into one shareable snapshot.' },
			{ command: 'pig cram --auto', description: 'Let PIG suggest the cram message.' },
			{ command: 'pig log', description: 'Show local snapshot history.' },
			{ command: 'pig diff [left] [right]', description: 'Compare snapshots or the working tree.' },
			{ command: 'pig undo [snapshot|path]', description: 'Restore a snapshot or file path.' },
			{ command: 'pig query "text"', description: 'Search local history semantically.' },
			{ command: 'pig suggest-save', description: 'Ask PIG for a save message from current changes.' }
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
			{ command: 'pig work ready [name]', description: 'Mark work ready for review. PIG can prompt to cram first.' },
			{ command: 'pig work merge <name>', description: 'Merge a local workspace into the current workspace.' }
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
			{ command: 'pig label list', description: 'List project labels.' },
			{ command: 'pig milestone list', description: 'List milestones.' },
			{ command: 'pig ready list', description: 'List workspaces marked ready on the remote.' },
			{ command: 'pig ready merge <workspace>', description: 'Merge ready remote work.' }
		]
	},
	{
		title: 'Releases, hooks, and automation',
		intro: 'These commands are useful for release tooling, deployment systems, and notification flows.',
		rows: [
			{ command: 'pig release list', description: 'List release entries.' },
			{ command: 'pig release new <tag> --name "v1" --notes "..."', description: 'Create a release from the latest source snapshot.' },
			{ command: 'pig release view <tag>', description: 'Show release details and artifacts.' },
			{ command: 'pig webhook list', description: 'List project webhooks.' },
			{ command: 'pig webhook new <event> <url>', description: 'Create a webhook for a project event.' },
			{ command: 'pig webhook test <id>', description: 'Send a test webhook delivery.' },
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
			{ command: 'pig snapshot verify <id>', description: 'Verify one signed snapshot remotely.' },
			{ command: 'pig snapshot verify --all', description: 'Verify every uploaded snapshot.' }
		]
	}
];
