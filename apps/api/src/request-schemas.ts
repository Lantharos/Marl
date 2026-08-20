import { array, boolean, integer, maxLength, maxValue, minLength, minValue, number, optional, picklist, pipe, record, strictObject, string, unknown } from 'valibot';

const shortString = pipe(string(), maxLength(1_000));
const bodyString = pipe(string(), maxLength(100_000));
const identifier = pipe(string(), minLength(1), maxLength(200));
const branch = pipe(string(), minLength(1), maxLength(1_024));
const mergeMethod = picklist(['merge', 'squash', 'rebase']);

export const branchRuleBody = strictObject({
  pattern: branch,
  requiredApprovals: pipe(number(), integer(), minValue(0), maxValue(10)),
  requiredChecks: pipe(array(pipe(string(), minLength(1), maxLength(160))), maxLength(32)),
  requireConversations: boolean(),
  dismissStaleReviews: boolean(),
  allowedMergeMethods: pipe(array(mergeMethod), minLength(1), maxLength(3))
});

export const gitIndexBody = strictObject({ repositoryId: identifier, indexId: identifier, complete: optional(boolean()), defaultBranch: optional(branch), commits: array(unknown()), branches: array(unknown()), entries: array(unknown()), changes: array(unknown()) });
export const createRepositoryBody = strictObject({ owner: identifier, name: identifier, description: optional(pipe(string(), maxLength(280))), visibility: optional(picklist(['public', 'private'])) });
export const repositorySettingsBody = strictObject({ description: optional(pipe(string(), maxLength(280))), visibility: optional(picklist(['public', 'private'])), defaultBranch: optional(branch), archived: optional(boolean()) });
export const repositoryOverviewBody = strictObject({ documents: pipe(array(pipe(string(), minLength(1), maxLength(4_096))), maxLength(12)) });
export const renameRepositoryBody = strictObject({ name: identifier });
export const transferRepositoryBody = strictObject({ owner: identifier });
export const deleteRepositoryBody = strictObject({ confirmation: pipe(string(), maxLength(500)) });
export const forkRepositoryBody = strictObject({ owner: identifier, name: identifier });

export const createPullBody = strictObject({ title: pipe(string(), minLength(1), maxLength(240)), body: optional(bodyString), sourceBranch: branch, sourceRepository: optional(identifier), targetBranch: branch, draft: optional(boolean()) });
export const updatePullBody = strictObject({ title: optional(pipe(string(), maxLength(240))), body: optional(bodyString) });
export const pullMetadataBody = strictObject({ assigneeIds: optional(pipe(array(identifier), maxLength(10))), labelIds: optional(pipe(array(identifier), maxLength(20))), locked: optional(boolean()) });
export const commentBody = strictObject({ body: pipe(string(), minLength(1), maxLength(50_000)) });
export const reviewThreadBody = strictObject({ path: pipe(string(), minLength(1), maxLength(4_096)), side: picklist(['old', 'new']), line: pipe(number(), integer(), minValue(1)), startSide: optional(picklist(['old', 'new'])), startLine: optional(pipe(number(), integer(), minValue(1))), body: pipe(string(), minLength(1), maxLength(20_000)) });
export const resolveThreadBody = strictObject({ resolved: optional(boolean()) });
export const reviewBody = strictObject({ state: picklist(['commented', 'approved', 'changes_requested']), body: optional(pipe(string(), maxLength(20_000))) });
export const mergeBody = strictObject({ method: optional(mergeMethod) });

export const runnerEnrollmentBody = strictObject({ organization: identifier, expiresMinutes: optional(pipe(number(), integer(), minValue(5), maxValue(60))) });
export const runnerRegistrationBody = strictObject({ enrollmentToken: identifier, name: identifier, labels: optional(pipe(array(shortString), maxLength(64))), platform: shortString, architecture: shortString, version: shortString, concurrency: optional(pipe(number(), integer(), minValue(1), maxValue(32))) });
export const completeJobBody = strictObject({ state: picklist(['success', 'failure', 'canceled']), exitCode: pipe(number(), integer()), summary: optional(shortString) });
export const artifactUploadBody = strictObject({ name: pipe(string(), minLength(1), maxLength(160)), byteSize: pipe(number(), integer(), minValue(0), maxValue(2 * 1024 * 1024 * 1024)), contentType: optional(pipe(string(), minLength(1), maxLength(200))) });
export const secretValueBody = strictObject({ value: pipe(string(), minLength(1), maxLength(64_000)) });
export const sshKeyBody = strictObject({ name: pipe(string(), minLength(1), maxLength(80)), publicKey: pipe(string(), minLength(32), maxLength(16_000)) });
export const signingKeysBody = strictObject({ emails: pipe(array(pipe(string(), minLength(3), maxLength(320))), maxLength(250)) });
export const pullRealtimeUpdateBody = strictObject({ id: identifier, pullId: identifier, version: pipe(number(), integer(), minValue(1)), kind: identifier, payload: record(string(), unknown()), createdAt: identifier });

const organizationRole = picklist(['admin', 'member']);
const repositoryRole = picklist(['read', 'triage', 'write', 'maintain', 'admin']);
const tokenScope = picklist(['repo:read', 'repo:write', 'repo:admin', 'workflow:dispatch']);
export const createOrganizationBody = strictObject({ slug: identifier, name: pipe(string(), minLength(1), maxLength(120)), baseRepositoryRole: optional(picklist(['read', 'triage', 'write', 'maintain'])) });
export const organizationSettingsBody = strictObject({ name: optional(pipe(string(), minLength(1), maxLength(120))), description: optional(pipe(string(), maxLength(280))), website: optional(pipe(string(), maxLength(200))), baseRepositoryRole: optional(picklist(['read', 'triage', 'write', 'maintain'])) });
export const organizationMemberBody = strictObject({ role: organizationRole });
export const organizationInvitationBody = strictObject({ email: pipe(string(), minLength(3), maxLength(320)), role: organizationRole });
export const createTeamBody = strictObject({ slug: identifier, name: pipe(string(), minLength(1), maxLength(120)), description: optional(pipe(string(), maxLength(280))) });
export const teamMemberBody = strictObject({ userId: identifier });
export const repositoryCollaboratorBody = strictObject({ userId: identifier, role: repositoryRole });
export const repositoryTeamGrantBody = strictObject({ teamId: identifier, role: repositoryRole });
export const personalAccessTokenBody = strictObject({ name: pipe(string(), minLength(1), maxLength(120)), scopes: pipe(array(tokenScope), minLength(1), maxLength(5)), repositoryIds: optional(pipe(array(identifier), maxLength(100))), expiresDays: optional(pipe(number(), integer(), minValue(1), maxValue(365))) });
export const profileBody = strictObject({ displayName: pipe(string(), minLength(1), maxLength(80)), username: pipe(string(), minLength(2), maxLength(39)), bio: pipe(string(), maxLength(280)), website: pipe(string(), maxLength(200)) });
