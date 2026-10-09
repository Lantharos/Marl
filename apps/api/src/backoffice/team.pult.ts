import { notify, role, slack } from 'pult';
import { comment } from './comments.pult';
import { organization } from './organizations.pult';
import { reports } from './reports.pult';
import { repository } from './repositories.pult';
import { user } from './users.pult';

export const moderator = role('moderator', {
  label: 'Moderator',
  inboxes: [reports],
  resources: [user, repository, organization, comment],
  actions: [
    comment.actions.remove,
    repository.actions.disable,
    repository.actions.enable,
    user.actions.suspend,
    user.actions.restore,
    user.actions.signOut
  ]
});

export const operator = role('operator', {
  label: 'Operator',
  resources: [user, repository, organization],
  actions: [user.actions.signOut],
  reveal: true,
  status: true
});

export const moderation = notify('moderation', {
  inboxes: [reports],
  on: ['created', 'reopened', 'overdue'],
  to: [moderator, slack('moderation')]
});
