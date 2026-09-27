import type { WebhookFormat } from '@marl/contracts';

type Payload = {
  event: string;
  action: string;
  repository: { owner: string; name: string; url: string };
  sender: { handle: string } | null;
  ref?: string;
  after?: string | null;
  headCommit?: { title: string; url: string } | null;
  pull?: { number: number; title: string; url: string };
  issue?: { number: number; title: string; url: string };
  review?: { state: string };
  comment?: { body: string };
  release?: { tagName: string; name: string; url: string };
  run?: { number: number; name: string; state: string; url: string };
};

function summary(payload: Payload) {
  const repository = `${payload.repository.owner}/${payload.repository.name}`;
  const who = payload.sender ? `@${payload.sender.handle}` : 'Marl';
  const link = (label: string, url: string, format: 'slack' | 'markdown') =>
    format === 'slack' ? `<${url}|${label}>` : `[${label}](${url})`;
  return (format: 'slack' | 'markdown') => {
    const item = payload.pull ?? payload.issue;
    const itemLink = item && link(`${payload.pull ? '!' : '#'}${item.number} ${item.title}`, item.url, format);
    switch (payload.event) {
      case 'push': {
        const branch = payload.ref?.replace('refs/heads/', '') ?? '';
        const commit = payload.headCommit ? `: ${link(payload.headCommit.title, payload.headCommit.url, format)}` : '';
        return `${who} pushed to ${branch} in ${repository}${commit}`;
      }
      case 'pull':
        return `${who} ${payload.action.replace('_', ' ')} ${itemLink} in ${repository}`;
      case 'issue':
        return `${who} ${payload.action} ${itemLink} in ${repository}`;
      case 'review':
        return `${who} ${payload.review?.state === 'approved' ? 'approved' : payload.review?.state === 'changes_requested' ? 'requested changes on' : 'reviewed'} ${itemLink}`;
      case 'comment':
        return `${who} commented on ${itemLink}\n> ${payload.comment?.body.slice(0, 300).replaceAll('\n', '\n> ') ?? ''}`;
      case 'release':
        return `${who} published ${link(payload.release?.name || payload.release?.tagName || '', payload.release?.url ?? '', format)} in ${repository}`;
      case 'run':
        return `Run ${link(`#${payload.run?.number} ${payload.run?.name}`, payload.run?.url ?? '', format)} ${payload.run?.state === 'success' ? 'passed' : payload.run?.state === 'failure' ? 'failed' : 'was canceled'} in ${repository}`;
      default:
        return `${who} triggered ${payload.event} in ${repository}`;
    }
  };
}

export function formatBody(format: WebhookFormat, payload: string) {
  if (format === 'json') return payload;
  const text = summary(JSON.parse(payload) as Payload);
  return JSON.stringify(format === 'slack' ? { text: text('slack') } : { content: text('markdown').slice(0, 2000) });
}
