import { route } from '../http/router';
import { updateIssueConclusion, updateIssueParticipation } from './discussion';
import { addIssueComment, deleteIssueComment, updateIssueComment } from './comments';
import { createIssue, createIssueLabel, setIssueState, updateIssue, updateIssueMetadata } from './issues';
import { linkIssuePull } from './pull-links';
import { getIssue, getIssueTimeline, listAllIssues, listIssues } from './queries';

const issues = '/repositories/:owner/:repo/issues';
const issue = `${issues}/:number(\\d+)`;

export const issueRoutes = [
  route('GET', '/issues', 'user', ({ env, principal, url }) => listAllIssues(env, principal, url)),
  route('GET', issues, 'optional', ({ env, principal, url }, { owner, repo }) =>
    listIssues(env, principal, owner, repo, url)
  ),
  route('POST', issues, 'user', ({ request, env, principal }, { owner, repo }) =>
    createIssue(request, env, principal, owner, repo)
  ),
  route('GET', issue, 'optional', ({ env, principal }, { owner, repo, number }) =>
    getIssue(env, principal, owner, repo, Number(number))
  ),
  route('PATCH', issue, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    updateIssue(request, env, principal, owner, repo, Number(number))
  ),
  route('GET', `${issue}/timeline`, 'optional', ({ env, principal, url }, { owner, repo, number }) =>
    getIssueTimeline(env, principal, owner, repo, Number(number), url)
  ),
  route('POST', `${issue}/comments`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    addIssueComment(request, env, principal, owner, repo, Number(number))
  ),
  route('PATCH', `${issue}/metadata`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    updateIssueMetadata(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${issue}/labels`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    createIssueLabel(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${issue}/state`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    setIssueState(request, env, principal, owner, repo, Number(number))
  ),
  route('PATCH', `${issue}/conclusion`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    updateIssueConclusion(request, env, principal, owner, repo, Number(number))
  ),
  route('PATCH', `${issue}/participation`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    updateIssueParticipation(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${issue}/links`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    linkIssuePull(request, env, principal, owner, repo, Number(number))
  ),
  route('PATCH', '/issue-comments/:id(comment_[a-z0-9]+)', 'user', ({ request, env, principal }, { id }) =>
    updateIssueComment(request, env, principal, id)
  ),
  route('DELETE', '/issue-comments/:id(comment_[a-z0-9]+)', 'user', ({ env, principal }, { id }) =>
    deleteIssueComment(env, principal, id)
  )
];
