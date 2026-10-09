import { env } from 'cloudflare:workers';
import { b, resource } from 'pult';
import { type CommentKind, removeComment } from './enforcement';

type Comment = {
  id: string;
  kind: CommentKind;
  body: string;
  authorId: string;
  author: string;
  repository: string;
  context: string;
  path: string;
  createdAt: string;
  deletedAt: string | null;
};

const repositoryName = (column: string) =>
  `(SELECT organizations.slug || '/' || repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=${column})`;

const lookup = `
  SELECT issue_comments.id,'issue' AS kind,issue_comments.body,issue_comments.author_id AS authorId,users.handle AS author,${repositoryName('issues.repository_id')} AS repository,issues.title AS context,'/issues/' || issues.number || '#comment-' || issue_comments.id AS path,issue_comments.created_at AS createdAt,issue_comments.deleted_at AS deletedAt
  FROM issue_comments JOIN issues ON issues.id=issue_comments.issue_id JOIN users ON users.id=issue_comments.author_id WHERE issue_comments.id=?1
  UNION ALL
  SELECT pull_request_comments.id,'pull',pull_request_comments.body,pull_request_comments.author_id,users.handle,${repositoryName('pull_requests.repository_id')},pull_requests.title,'/pulls/' || pull_requests.number,pull_request_comments.created_at,pull_request_comments.deleted_at
  FROM pull_request_comments JOIN pull_requests ON pull_requests.id=pull_request_comments.pull_request_id JOIN users ON users.id=pull_request_comments.author_id WHERE pull_request_comments.id=?1
  UNION ALL
  SELECT review_comments.id,'review',review_comments.body,review_comments.author_id,users.handle,${repositoryName('pull_requests.repository_id')},pull_requests.title,'/pulls/' || pull_requests.number,review_comments.created_at,review_comments.deleted_at
  FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id JOIN users ON users.id=review_comments.author_id WHERE review_comments.id=?1`;

export const comment = resource('comment', {
  icon: 'message',
  get: (id) => env.DB.prepare(lookup).bind(id).first<Comment>(),
  title: (c) => `Comment by @${c.author} on ${c.context}`,
  subtitle: (c) => c.repository,
  fields: (c) => ({ kind: c.kind, written: new Date(c.createdAt), removed: Boolean(c.deletedAt) }),
  url: (c) => `${env.PUBLIC_URL}/${c.repository}${c.path}`,
  render: (c) => [
    b.fields({
      author: b.ref('user', c.authorId, `@${c.author}`),
      repository: c.repository,
      written: new Date(c.createdAt),
      removed: c.deletedAt ? new Date(c.deletedAt) : undefined
    }),
    b.markdown(c.body)
  ],
  actions: (action) => ({
    remove: action({
      danger: 'confirm',
      automatable: true,
      when: (c) => !c.deletedAt,
      run: async ({ record, actor }) => {
        await removeComment(env, actor, record.kind, record.id);
        return `Removed the comment by @${record.author}`;
      }
    })
  })
});
