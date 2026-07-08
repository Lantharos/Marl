export type ApiScope = {
	scope: string;
	allows: string;
};

export type EndpointGroup = {
	title: string;
	note: string;
	endpoints: string[];
};

export const protocolCapabilities = [
	'issues',
	'milestones',
	'labels',
	'ready',
	'merge_rules',
	'status_checks',
	'ci',
	'ci_runners',
	'comments',
	'reactions',
	'hooks',
	'webhooks',
	'api_keys',
	'granular_api_keys',
	'developer_apps',
	'oauth_apps',
	'search',
	'follows',
	'releases',
	'public_releases',
	'leaves',
	'signed_snapshots',
	'profiles',
	'ssh_keys',
	'remote_approvals',
	'audit_log',
	'notifications',
	'permissions',
	'collaborators',
	'project_archive',
	'forks',
	'sendwork',
	'object_batch_upload',
	'object_batch_download',
	'object_path_closure'
];

export const apiScopes: ApiScope[] = [
	{ scope: 'main:read', allows: 'Read the default workspace, project overview, code, screenshots, history, stats, and release source metadata.' },
	{ scope: 'main:write', allows: 'Advance the default workspace head. This is intentionally separate from workspace feature work.' },
	{ scope: 'workspaces:read', allows: 'Read non-main workspace heads, history, diffs, ready state, and workspace files.' },
	{ scope: 'workspaces:create', allows: 'Create and push new feature workspaces without touching main.' },
	{ scope: 'workspaces:write', allows: 'Update non-main workspace heads and upload feature-work objects.' },
	{ scope: 'workspaces:ready', allows: 'Mark workspaces ready or send them back for changes.' },
	{ scope: 'workspaces:merge', allows: 'Merge ready workspace work into its target workspace.' },
	{ scope: 'issues:read', allows: 'Read issues, labels, milestones, comments, and reactions.' },
	{ scope: 'issues:write', allows: 'Create and edit issues, labels, milestones, comments, and reactions.' },
	{ scope: 'releases:read', allows: 'Read releases, tags, artifacts, and public release metadata.' },
	{ scope: 'releases:write', allows: 'Create releases, upload artifacts, and manage release metadata.' },
	{ scope: 'status_checks', allows: 'Read and report workspace status checks.' },
	{ scope: 'ci:write', allows: 'Manage CI runners and update CI job state for a project.' },
	{ scope: 'webhooks:read', allows: 'List webhooks, integrations, and webhook delivery state.' },
	{ scope: 'webhooks:write', allows: 'Create, test, trigger, and revoke project webhooks.' },
	{ scope: 'settings:read', allows: 'Read project settings visible to users with project access.' },
	{ scope: 'settings:write', allows: 'Change project appearance, navigation, screenshots, archive state, visibility, source boundaries, merge rules, protection, and automation settings.' }
];

export const endpointGroups: EndpointGroup[] = [
	{
		title: 'Identity and discovery',
		note: 'Session endpoints use user bearer tokens. Discovery endpoints can return public project data without auth.',
		endpoints: [
			'GET /v1/capabilities',
			'POST /v1/session/exchange',
			'DELETE /v1/session',
			'POST /v1/auth/check',
			'GET /v1/me',
			'GET /v1/account/settings',
			'PATCH /v1/account/settings',
			'POST /v1/account/tenant',
			'GET /v1/profiles/:tenant',
			'PUT /v1/profiles/:tenant/pins',
			'GET /v1/notifications',
			'POST /v1/notifications/:notification/read',
			'GET /v1/home',
			'GET /v1/follows',
			'GET /v1/discover/projects?q=<query>',
			'GET /v1/projects',
			'GET /v1/users/:handle/profile',
			'GET /v1/users/search?q=<query>'
		]
	},
	{
		title: 'Tenants, projects, and access',
		note: 'Projects are private by default. A user account is also a tenant named by the public handle. Project creation accepts an optional folder for grouping separate repositories under one product area.',
		endpoints: [
			'POST /v1/orgs',
			'POST /v1/forks',
			'GET /v1/projects',
			'GET /v1/tenants/:tenant/collaborators',
			'POST /v1/tenants/:tenant/collaborators',
			'PATCH /v1/tenants/:tenant/collaborators/:user',
			'DELETE /v1/tenants/:tenant/collaborators/:user',
			'GET /v1/tenants/:tenant/folders',
			'POST /v1/tenants/:tenant/folders',
			'GET /v1/tenants/:tenant/leaves',
			'POST /v1/tenants/:tenant/leaves',
			'GET /v1/tenants/:tenant/leaves/:leaf',
			'PATCH /v1/tenants/:tenant/leaves/:leaf',
			'DELETE /v1/tenants/:tenant/leaves/:leaf',
			'GET /v1/tenants/:tenant/projects',
			'POST /v1/tenants/:tenant/projects/:project',
			'GET /v1/tenants/:tenant/projects/:project',
			'DELETE /v1/tenants/:tenant/projects/:project',
			'PATCH /v1/tenants/:tenant/projects/:project/folder',
			'GET /v1/tenants/:tenant/projects/:project/access',
			'GET /v1/tenants/:tenant/projects/:project/collaborators',
			'POST /v1/tenants/:tenant/projects/:project/collaborators',
			'PATCH /v1/tenants/:tenant/projects/:project/collaborators/:user',
			'DELETE /v1/tenants/:tenant/projects/:project/collaborators/:user',
			'GET /v1/tenants/:tenant/projects/:project/overview',
			'GET /v1/tenants/:tenant/projects/:project/leaves',
			'POST /v1/tenants/:tenant/projects/:project/leaves',
			'GET /v1/tenants/:tenant/projects/:project/leaves/:leaf',
			'PATCH /v1/tenants/:tenant/projects/:project/leaves/:leaf',
			'DELETE /v1/tenants/:tenant/projects/:project/leaves/:leaf',
			'GET /v1/tenants/:tenant/projects/:project/screenshots',
			'POST /v1/tenants/:tenant/projects/:project/screenshots',
			'POST /v1/tenants/:tenant/projects/:project/screenshots/:item_id/feature',
			'DELETE /v1/tenants/:tenant/projects/:project/screenshots/:item_id',
			'GET /v1/tenants/:tenant/projects/:project/screenshots/:item_id/download',
			'GET /v1/tenants/:tenant/projects/:project/stats',
			'GET /v1/tenants/:tenant/projects/:project/settings',
			'PATCH /v1/tenants/:tenant/projects/:project/settings',
			'GET /v1/tenants/:tenant/projects/:project/audit-log'
		]
	},
	{
		title: 'Code, objects, and sync',
		note: 'Object ids are immutable. Uploaded trees must use safe path segments and workspace heads are accepted only when their tree objects are complete. Head updates use compare-and-swap unless a client explicitly force-syncs rewritten history. Tree listing supports path, depth, limit, and cursor query parameters for bounded browsing. Source boundaries filter tree, file, and archive reads by caller. Raw object reads require full source access when a project has non-public path rules. Source archive downloads stream a zip of the selected workspace. Object upload and download batches are bounded by item count and decoded byte size.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/tree?workspace=main&path=src&depth=1&limit=500',
			'GET /v1/tenants/:tenant/projects/:project/source.zip?workspace=main',
			'GET /v1/tenants/:tenant/projects/:project/files/:path',
			'GET /v1/tenants/:tenant/projects/:project/files?path=src/app.ts',
			'GET /v1/tenants/:tenant/projects/:project/workspaces',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/head',
			'PUT /v1/tenants/:tenant/projects/:project/workspaces/:workspace/head',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/compare',
			'POST /v1/tenants/:tenant/projects/:project/objects/missing',
			'POST /v1/tenants/:tenant/projects/:project/objects/check',
			'POST /v1/tenants/:tenant/projects/:project/objects/download',
			'POST /v1/tenants/:tenant/projects/:project/objects/upload',
			'POST /v1/tenants/:tenant/projects/:project/objects/path-closure',
			'PUT /v1/tenants/:tenant/projects/:project/objects/:object',
			'GET /v1/tenants/:tenant/projects/:project/objects/:object'
		]
	},
	{
		title: 'Work review and history',
		note: 'Ready review lives on workspaces. Review states include draft, ready, approved, changes requested, merged, closed, reopened, and not planned. History list endpoints return a bounded window by default, accept a limit query parameter, and include affected components when project components are configured. Project comments can target a workspace, save, file, line, or line range. Workspace metadata stores reviewers, assignees, milestone, linked issues, lock state, and private, team, or public visibility. Merge rules can require approvals, passing checks, current-head approvals, component owner approvals, and resolved file conversations. Project CI settings enqueue filtered jobs for workspace pushes, ready workspace heads, and release events. Runner labels route jobs to compatible self-hosted runners, command env and secret selection are injected into claimed jobs, reusable command blocks are materialized before queueing, runner wakeups use WebSockets when available, runner job state mirrors into workspace checks, and maintainers can cancel or rerun jobs.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/history',
			'GET /v1/tenants/:tenant/projects/:project/history/:entry_id',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/history',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/history',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/history/rewrite',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/merge-preview',
			'GET /v1/tenants/:tenant/projects/:project/ready',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/ready',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/reviews',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/reviews',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/checks',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/checks',
			'GET /v1/tenants/:tenant/projects/:project/ci/jobs',
			'GET /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/logs',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/claim',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/logs',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/logs/batch',
			'PATCH /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/cancel',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/rerun',
			'POST /v1/tenants/:tenant/projects/:project/sendwork',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/merge',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/reject',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/close',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/reopen',
			'DELETE /v1/tenants/:tenant/projects/:project/workspaces/:workspace',
			'PATCH /v1/tenants/:tenant/projects/:project/workspaces/:workspace/labels',
			'PATCH /v1/tenants/:tenant/projects/:project/workspaces/:workspace/metadata',
			'GET /v1/tenants/:tenant/projects/:project/comments?workspace=feature&file=src/app.ts&line=42',
			'POST /v1/tenants/:tenant/projects/:project/comments',
			'PATCH /v1/tenants/:tenant/projects/:project/comments/:comment_id',
			'DELETE /v1/tenants/:tenant/projects/:project/comments/:comment_id'
		]
	},
	{
		title: 'Issues and project records',
		note: 'Issues support filtered listing, comments, persisted reactions, metadata activity, labels, first-class components, assignees, milestones, linked workspaces, issue types, lock or pin state, transfer, deletion, and open, closed, or closed-as-not-planned state updates. Labels, milestones, hooks, and tags use standard paginated protocol collections. Project comments can also carry review target fields when they belong to code review.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/issues',
			'POST /v1/tenants/:tenant/projects/:project/issues',
			'GET /v1/tenants/:tenant/projects/:project/issues/:issue_id',
			'PATCH /v1/tenants/:tenant/projects/:project/issues/:issue_id',
			'DELETE /v1/tenants/:tenant/projects/:project/issues/:issue_id',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/close',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/reopen',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/transfer',
			'GET /v1/tenants/:tenant/projects/:project/issues/:issue_id/comments',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/comments',
			'GET /v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions',
			'DELETE /v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions/:reaction',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/assignees',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/labels',
			'GET /v1/tenants/:tenant/projects/:project/labels',
			'GET /v1/tenants/:tenant/projects/:project/milestones',
			'POST /v1/tenants/:tenant/projects/:project/milestones',
			'GET /v1/tenants/:tenant/projects/:project/milestones/:item_id',
			'POST /v1/tenants/:tenant/projects/:project/milestones/:item_id/close',
			'POST /v1/tenants/:tenant/projects/:project/labels',
			'DELETE /v1/tenants/:tenant/projects/:project/labels/:item_id',
			'GET /v1/tenants/:tenant/projects/:project/comments',
			'GET /v1/tenants/:tenant/projects/:project/comments/:comment_id/reactions',
			'POST /v1/tenants/:tenant/projects/:project/comments/:comment_id/reactions',
			'DELETE /v1/tenants/:tenant/projects/:project/comments/:comment_id/reactions/:reaction',
			'GET /v1/tenants/:tenant/projects/:project/tags'
		]
	},
	{
		title: 'Automation and integrations',
		note: 'Maintainers manage these. OAuth integrations mint project-scoped tokens with the same granular scopes as API keys. Webhook deliveries and CI job creation are queued before workers process them. CI commands can target events, workspaces, changed paths, affected components, matrices, reusable blocks, and runner labels. CI runners use dedicated runner tokens, wait on project runner events when available, and claim queued jobs for a single project when their labels match the command. Runner tokens can upload logs, job artifacts, and cache data for active jobs. CI artifacts can be downloaded from job history, caches may be raw files or tar.gz directory archives, and CI secrets are injected into runner jobs with log redaction.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/api-keys',
			'POST /v1/tenants/:tenant/projects/:project/api-keys',
			'DELETE /v1/tenants/:tenant/projects/:project/api-keys/:item_id',
			'GET /v1/tenants/:tenant/projects/:project/hooks',
			'POST /v1/tenants/:tenant/projects/:project/hooks',
			'DELETE /v1/tenants/:tenant/projects/:project/hooks/:item_id',
			'POST /v1/tenants/:tenant/projects/:project/hooks/:item_id/test',
			'GET /v1/tenants/:tenant/projects/:project/webhooks',
			'POST /v1/tenants/:tenant/projects/:project/webhooks',
			'DELETE /v1/tenants/:tenant/projects/:project/webhooks/:id',
			'GET /v1/tenants/:tenant/projects/:project/webhooks/:id/deliveries',
			'POST /v1/tenants/:tenant/projects/:project/webhooks/:id/test',
			'POST /v1/tenants/:tenant/projects/:project/webhooks/:id/trigger',
			'GET /v1/tenants/:tenant/projects/:project/integrations',
			'DELETE /v1/tenants/:tenant/projects/:project/integrations/:item_id',
			'GET /v1/tenants/:tenant/projects/:project/ci/runners',
			'POST /v1/tenants/:tenant/projects/:project/ci/runners',
			'DELETE /v1/tenants/:tenant/projects/:project/ci/runners/:runner_id',
			'GET /v1/tenants/:tenant/projects/:project/ci/runners/events',
			'GET /v1/tenants/:tenant/projects/:project/ci/jobs',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/claim',
			'PATCH /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/cancel',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/rerun',
			'GET /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/logs',
			'POST /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/logs/batch',
			'GET /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/artifacts',
			'PUT /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/artifacts/:name',
			'GET /v1/tenants/:tenant/projects/:project/ci/jobs/:job_id/artifacts/:artifact/download',
			'GET /v1/tenants/:tenant/projects/:project/ci/cache/:key',
			'PUT /v1/tenants/:tenant/projects/:project/ci/cache/:key',
			'GET /v1/tenants/:tenant/projects/:project/ci/secrets',
			'PUT /v1/tenants/:tenant/projects/:project/ci/secrets',
			'DELETE /v1/tenants/:tenant/projects/:project/ci/secrets/:key',
			'GET /v1/developer/apps',
			'POST /v1/developer/apps',
			'DELETE /v1/developer/apps/:app_id',
			'GET /v1/oauth/apps/:client_id',
			'POST /v1/oauth/authorize',
			'POST /v1/oauth/token'
		]
	},
	{
		title: 'Releases and account keys',
		note: 'Release artifacts are stored by sty. Releases can be project-scoped or tied to one or more project components, which keeps monorepo package releases separate without splitting the project history. Private projects can make release files public, but source archives are public only when the project is public. Signing keys are user-scoped, not project-scoped.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/releases',
			'POST /v1/tenants/:tenant/projects/:project/releases',
			'GET /v1/tenants/:tenant/projects/:project/releases/:release',
			'PATCH /v1/tenants/:tenant/projects/:project/releases/:release',
			'DELETE /v1/tenants/:tenant/projects/:project/releases/:release',
			'POST /v1/tenants/:tenant/projects/:project/releases/:release/artifacts',
			'GET /v1/tenants/:tenant/projects/:project/releases/:release/artifacts/:artifact/download',
			'GET /v1/account/keys',
			'POST /v1/account/keys',
			'DELETE /v1/account/keys/:key_id',
			'GET /v1/account/ssh-keys',
			'POST /v1/account/ssh-keys',
			'DELETE /v1/account/ssh-keys/:key_id',
			'GET /v1/tenants/:tenant/projects/:project/keys',
			'POST /v1/tenants/:tenant/projects/:project/keys',
			'DELETE /v1/tenants/:tenant/projects/:project/keys/:item_id',
			'GET /v1/tenants/:tenant/projects/:project/snapshots/verify',
			'GET /v1/tenants/:tenant/projects/:project/snapshots/:item_id/verify',
			'GET /v1/tenants/:tenant/projects/:project/ssh-keys',
			'POST /v1/tenants/:tenant/projects/:project/ssh-keys',
			'DELETE /v1/tenants/:tenant/projects/:project/ssh-keys/:item_id',
			'POST /v1/remote-approvals',
			'GET /v1/remote-approvals/:approval_id',
			'POST /v1/remote-approvals/:approval_id/approve'
		]
	}
];

export const webhookEvents = [
	{ event: 'manual', meaning: 'A maintainer triggered a webhook from automation settings.' },
	{ event: 'sync', meaning: 'A sync completed for a project.' },
	{ event: 'snapshot.saved', meaning: 'A save snapshot was recorded remotely.' },
	{ event: 'snapshot.packed', meaning: 'A pack snapshot was recorded remotely.' },
	{ event: 'snapshot.shipped', meaning: 'A shipped snapshot or tag was recorded.' },
	{ event: 'workspace.ready', meaning: 'A workspace was marked ready for review.' },
	{ event: 'workspace.merged', meaning: 'A workspace was merged.' },
	{ event: 'release.created', meaning: 'A release was created.' },
	{ event: 'release.artifact_uploaded', meaning: 'A release artifact was uploaded.' },
	{ event: 'issue.created', meaning: 'An issue was opened.' },
	{ event: 'issue.updated', meaning: 'An issue changed state, title, labels, assignee, or body.' }
];

export const paginationJson = `{
  "items": [],
  "page": 1,
  "per_page": 25,
  "total": 0,
  "total_pages": 1,
  "next": null,
  "prev": null
}`;

export const pathClosureJson = `{
  "workspace": "main",
  "snapshot": null,
  "path": "src/parser"
}`;

export const pathClosureResponseJson = `{
  "workspace": "main",
  "head": "<snapshot-id>",
  "root_tree": "<tree-id>",
  "path": "src/parser",
  "objects": [
    { "id": "<snapshot-id>", "kind": "snapshot" },
    { "id": "<tree-id>", "kind": "tree" },
    { "id": "<blob-id>", "kind": "blob" }
  ],
  "files": [
    { "path": "src/parser/mod.rs", "id": "<blob-id>" }
  ]
}`;

export const apiKeyCreateJson = `{
  "name": "release bot",
  "scopes": ["releases:read", "releases:write", "webhooks:read"],
  "expires_at": null
}`;

export const oauthTokenJson = `{
  "client_id": "app_...",
  "client_secret": "sty_secret_...",
  "code": "returned_code",
  "redirect_uri": "https://deploy.example.com/sty/callback",
  "grant_type": "authorization_code"
}`;

export const webhookPayloadJson = `{
  "event": "release.created",
  "delivery": "del_...",
  "tenant": "acme",
  "project": "sty",
  "sent_at": "2026-04-30T12:00:00Z",
  "data": {
    "release": {
      "tag": "v1.0.0"
    }
  }
}`;
