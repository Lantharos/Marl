import { pigCommandGroups, styCommandGroups } from './commands';
import { docsNav } from './navigation';
import { apiScopes, endpointGroups, pathClosureJson, pathClosureResponseJson, protocolCapabilities, webhookEvents } from './protocol';
import { unixInstallCommand, windowsInstallCommand } from '../install';

function commandLines() {
	return [...styCommandGroups, ...pigCommandGroups]
		.flatMap((group) => [group.title, ...group.rows.map((row) => `- ${row.command}: ${row.description}`)])
		.join('\n');
}

function endpointLines() {
	return endpointGroups
		.flatMap((group) => [group.title, ...group.endpoints.map((endpoint) => `- ${endpoint}`)])
		.join('\n');
}

function scopeLines() {
	return apiScopes.map((scope) => `- ${scope.scope}: ${scope.allows}`).join('\n');
}

function eventLines() {
	return webhookEvents.map((event) => `- ${event.event}: ${event.meaning}`).join('\n');
}

function capabilityLines() {
	return protocolCapabilities.map((capability) => `- ${capability}`).join('\n');
}

function docsLines() {
	return docsNav.map((item) => `- ${item.href}: ${item.title} - ${item.description}`).join('\n');
}

export function llmsTxt() {
	return `# sty docs for agents

sty provides identity, tenants, projects, remote sync, issues, workspaces, releases, API keys, OAuth apps, webhooks, and a browser dashboard for PIG repositories.

Primary docs:
${docsLines()}
- /pig
- /privacy
- /terms

Human setup:
1. Install sty. macOS/Linux: ${unixInstallCommand}. Windows: ${windowsInstallCommand}.
2. The installer asks whether to install both sty and pig, or pig only. For non-interactive installs, set STY_INSTALL_COMPONENTS to both or pig.
3. Run sty login when sty was installed.
4. Run sty tenant new when creating an organization tenant, or sty tenant new --name <tenant> in non-interactive contexts.
5. Run sty init from the repository for prompts, or sty init --tenant <tenant> --project <project> in non-interactive contexts.
6. Use pig save, pig pack, pig work new, pig work ready, and pig sync.

PIG model:
- A save is a local snapshot. Saves are cheap and reversible.
- A pack combines recent saves into one shareable snapshot before review or sync.
- A workspace is a named line of work. Isolated workspaces create separate folders for parallel agents or features.
- pig op log records local VCS operations that changed metadata or history. pig op undo reverts those operations without creating content snapshots.
- pig undo restores content from snapshots or paths.
- pig resolve --reuse applies a previously recorded conflict resolution when the same conflict shape appears again.
- pig fetch path <path> fetches one remote file or directory by object closure. Use --no-hydrate to cache without writing files.
- pig sync --force intentionally replaces the remote workspace head after local history was packed or rewritten.
- sty ci runner new creates self-hosted runner tokens. pig ci run claims leased jobs, restores configured file or directory caches, runs commands, uploads logs/artifacts, saves caches, and reports the result.
- Use --json for commands an agent needs to parse.

Forking:
- sty fork <tenant>/<project> forks a public project into the signed-in account.
- Use --mode contribute to keep a link for future sty sendwork, or --mode detached to copy the project and break the contribution link.
- sty sendwork, alias sty sw, syncs the current fork workspace and publishes it to the parent project as ready work with a title and message.

Authentication:
- User sessions use Authorization: Bearer <sty-token>.
- Project API keys use the same bearer header and are scoped to one tenant/project.
- OAuth developer apps create project-scoped bearer tokens after a maintainer approves access.
- API responses may include x-d1-bookmark. Send it back as x-d1-bookmark on later requests to continue a consistent database session.

Access model:
- Projects are private by default.
- Workspace visibility can be private, team, or public.
- Project API keys are granular and project-scoped.
- main:write is separate from workspace write scopes.
- sty can queue CI jobs for ready workspace heads. Self-hosted runners use runner tokens, wait on WebSocket wakeups when available, fall back to adaptive polling, execute commands outside the Worker, upload batched logs, artifacts, and directory caches, and report results into workspace checks. CI artifacts and caches follow the project retention window. External systems can still report checks directly through the checks API.

Pagination envelope:
- items, page, per_page, total, total_pages, next, prev.

Protocol capabilities:
${capabilityLines()}

Path closure request:
${pathClosureJson}

Path closure response:
${pathClosureResponseJson}

API scopes:
${scopeLines()}

Endpoints:
${endpointLines()}

Webhook events:
${eventLines()}

Commands:
${commandLines()}
`;
}
