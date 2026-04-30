import { pigCommandGroups, styCommandGroups } from './commands';
import { apiScopes, endpointGroups, webhookEvents } from './protocol';
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

export function llmsTxt() {
	return `# sty docs for agents

sty provides identity, tenants, projects, remote sync, issues, workspaces, releases, API keys, OAuth apps, webhooks, and a browser dashboard for PIG repositories.

Primary docs:
- /docs
- /docs/getting-started
- /docs/pig
- /docs/api
- /docs/api-keys
- /docs/oauth
- /docs/webhooks
- /docs/releases
- /pig
- /privacy
- /terms

Human setup:
1. Install sty. macOS/Linux: ${unixInstallCommand}. Windows: ${windowsInstallCommand}.
2. The installer asks whether to install both sty and pig, or pig only. For non-interactive installs, set STY_INSTALL_COMPONENTS to both or pig.
3. Run sty login when sty was installed.
4. Run sty tenant new <tenant> when creating an organization tenant.
5. Run sty init <tenant>/<project> from the repository.
6. Use pig save, pig work new, pig work ready, and pig sync.

Authentication:
- User sessions use Authorization: Bearer <sty-token>.
- Project API keys use the same bearer header and are scoped to one tenant/project.
- OAuth developer apps create project-scoped bearer tokens after a maintainer approves access.

Pagination envelope:
- items, page, per_page, total, total_pages, next, prev.

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
