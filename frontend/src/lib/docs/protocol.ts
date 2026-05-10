export type ApiScope = {
	scope: string;
	allows: string;
};

export type EndpointGroup = {
	title: string;
	note: string;
	endpoints: string[];
};

export const apiScopes: ApiScope[] = [
	{ scope: 'main:read', allows: 'Read the default workspace, project overview, code, history, stats, and release source metadata.' },
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
	{ scope: 'webhooks:read', allows: 'List webhooks, integrations, and webhook delivery state.' },
	{ scope: 'webhooks:write', allows: 'Create, test, trigger, and revoke project webhooks.' },
	{ scope: 'settings:read', allows: 'Read project settings visible to maintainers.' },
	{ scope: 'settings:write', allows: 'Change project settings, archive state, visibility, and project automation settings.' }
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
			'GET /v1/home',
			'GET /v1/discover/projects?q=<query>',
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
			'GET /v1/tenants/:tenant/folders',
			'POST /v1/tenants/:tenant/folders',
			'GET /v1/tenants/:tenant/projects',
			'POST /v1/tenants/:tenant/projects/:project',
			'GET /v1/tenants/:tenant/projects/:project',
			'DELETE /v1/tenants/:tenant/projects/:project',
			'PATCH /v1/tenants/:tenant/projects/:project/folder',
			'GET /v1/tenants/:tenant/projects/:project/access',
			'GET /v1/tenants/:tenant/projects/:project/stats',
			'GET /v1/tenants/:tenant/projects/:project/settings',
			'PATCH /v1/tenants/:tenant/projects/:project/settings'
		]
	},
	{
		title: 'Code, objects, and sync',
		note: 'Object ids are immutable. Uploaded trees must use safe path segments and workspace heads are accepted only when their tree objects are complete. Tree listing supports path, depth, limit, and cursor query parameters for bounded browsing. Source archive downloads stream a zip of the selected workspace.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/tree?workspace=main&path=src&depth=1&limit=500',
			'GET /v1/tenants/:tenant/projects/:project/source.zip?workspace=main',
			'GET /v1/tenants/:tenant/projects/:project/files/:path',
			'GET /v1/tenants/:tenant/projects/:project/workspaces',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/head',
			'PUT /v1/tenants/:tenant/projects/:project/workspaces/:workspace/head',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/compare',
			'POST /v1/tenants/:tenant/projects/:project/objects/missing',
			'PUT /v1/tenants/:tenant/projects/:project/objects/:object',
			'GET /v1/tenants/:tenant/projects/:project/objects/:object'
		]
	},
	{
		title: 'Work review and history',
		note: 'Ready review lives on workspaces. Review states include draft, ready, changes requested, merged, closed, reopened, and not planned. History list endpoints return a bounded window by default and accept a limit query parameter. Project comments can target a workspace, save, file, line, or line range. Workspace metadata stores reviewers, assignees, milestone, linked issues, and lock state.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/history',
			'GET /v1/tenants/:tenant/projects/:project/history/:entry_id',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/history',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/history',
			'GET /v1/tenants/:tenant/projects/:project/workspaces/:workspace/merge-preview',
			'GET /v1/tenants/:tenant/projects/:project/ready',
			'POST /v1/tenants/:tenant/projects/:project/workspaces/:workspace/ready',
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
		note: 'Issues support filtered listing, comments, metadata activity, labels, assignees, milestones, linked workspaces, issue types, lock or pin state, transfer, deletion, and open, closed, or closed-as-not-planned state updates. Labels, milestones, hooks, and tags use standard paginated protocol collections. Project comments can also carry review target fields when they belong to code review.',
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
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/assignees',
			'POST /v1/tenants/:tenant/projects/:project/issues/:issue_id/labels',
			'GET /v1/tenants/:tenant/projects/:project/labels',
			'GET /v1/tenants/:tenant/projects/:project/milestones',
			'GET /v1/tenants/:tenant/projects/:project/comments',
			'GET /v1/tenants/:tenant/projects/:project/tags'
		]
	},
	{
		title: 'Automation and integrations',
		note: 'Maintainers manage these. OAuth integrations mint project-scoped tokens with the same granular scopes as API keys.',
		endpoints: [
			'GET /v1/tenants/:tenant/projects/:project/api-keys',
			'POST /v1/tenants/:tenant/projects/:project/api-keys',
			'GET /v1/tenants/:tenant/projects/:project/webhooks',
			'POST /v1/tenants/:tenant/projects/:project/webhooks',
			'POST /v1/tenants/:tenant/projects/:project/webhooks/:id/test',
			'POST /v1/tenants/:tenant/projects/:project/webhooks/:id/trigger',
			'GET /v1/tenants/:tenant/projects/:project/integrations',
			'GET /v1/developer/apps',
			'POST /v1/developer/apps',
			'POST /v1/oauth/authorize',
			'POST /v1/oauth/token'
		]
	},
	{
		title: 'Releases and account keys',
		note: 'Release artifacts are stored by sty. Signing keys are user-scoped, not project-scoped.',
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
			'GET /v1/remote-approvals/:approval_id',
			'POST /v1/remote-approvals/:approval_id/approve'
		]
	}
];

export const webhookEvents = [
	{ event: 'manual', meaning: 'A maintainer triggered a webhook from automation settings.' },
	{ event: 'sync', meaning: 'A sync completed for a project.' },
	{ event: 'snapshot.saved', meaning: 'A save snapshot was recorded remotely.' },
	{ event: 'snapshot.crammed', meaning: 'A cram snapshot was recorded remotely.' },
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
  "tenant": "lantharos",
  "project": "sty",
  "sent_at": "2026-04-30T12:00:00Z",
  "data": {
    "release": {
      "tag": "v1.0.0"
    }
  }
}`;
