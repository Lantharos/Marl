import { b, choice, inbox, noul, setState, tag, triage } from 'pult';
import type { ReportReason, ReportSubjectType } from '@marl/contracts';
import { z } from 'zod';

export const reportReasons = {
  spam: 'Spam',
  malware: 'Malware or phishing',
  harassment: 'Harassment or hate',
  copyright: 'Copyright infringement',
  private_information: 'Private information',
  illegal: 'Illegal content',
  other: 'Something else'
} as const satisfies Record<ReportReason, string>;

export const subjectTypes = [
  'repository',
  'issue',
  'pull',
  'issue_comment',
  'pull_comment',
  'review_comment',
  'user'
] as const satisfies readonly ReportSubjectType[];

const person = z.object({ id: z.string(), handle: z.string() });

function subjectField(subject: { type: (typeof subjectTypes)[number]; id: string; title: string; url: string }) {
  if (subject.type === 'repository') return b.ref('repository', subject.id, subject.title);
  if (subject.type === 'user') return b.ref('user', subject.id, subject.title);
  if (subject.type.endsWith('_comment')) return b.ref('comment', subject.id, subject.title);
  return subject.title;
}

export const reports = inbox('reports', {
  icon: 'flag',
  states: ['open', 'actioned', 'dismissed'],
  reopenOn: 'new-occurrence',
  sla: { open: '1d' },
  columns: ['title', 'state', 'occurrences', 'data.reason', 'lastSeen'],
  data: z.object({
    subject: z.object({
      type: z.enum(subjectTypes),
      id: z.string(),
      title: z.string(),
      url: z.url(),
      excerpt: z.string().max(5000)
    }),
    reason: z.enum(Object.keys(reportReasons) as [keyof typeof reportReasons]),
    details: z.string().max(5000),
    reporter: person,
    author: person.nullable(),
    repository: z.object({ id: z.string(), name: z.string() }).nullable()
  }),
  title: (data) => `${reportReasons[data.reason]}: ${data.subject.title}`,
  render: (item) => [
    b.fields({
      reported: subjectField(item.data.subject),
      author: item.data.author ? b.ref('user', item.data.author.id, `@${item.data.author.handle}`) : undefined,
      repository: item.data.repository
        ? b.ref('repository', item.data.repository.id, item.data.repository.name)
        : undefined,
      reason: reportReasons[item.data.reason],
      reporter: b.ref('user', item.data.reporter.id, `@${item.data.reporter.handle}`),
      reports: item.occurrences,
      'last reported': item.lastSeen
    }),
    ...(item.data.details ? [b.markdown(item.data.details)] : []),
    ...(item.data.subject.excerpt ? [b.code(item.data.subject.excerpt, { title: 'Reported content' })] : []),
    b.markdown(`[Open on Marl](${item.data.subject.url})`)
  ],
  triage: triage({
    instructions:
      'People report content on Marl, a code hosting platform, for breaking the Acceptable Use Policy. ' +
      'Judge the reported content in `subject.excerpt`, not the reporter’s description of it. ' +
      'Code, security research and strong technical disagreement are allowed.',
    questions: {
      violates: noul(
        'Does `subject.excerpt` break the Acceptable Use Policy: spam, malware, phishing, harassment, hate, someone’s private information or illegal content?'
      ),
      category: choice(
        {
          spam: 'Advertising, SEO links, scams or bulk automated content',
          malware: 'Code or links meant to harm people or systems',
          abuse: 'Harassment, threats or hate aimed at people',
          privacy: 'Personal data or credentials that belong to someone else',
          fine: 'Nothing wrong with it'
        },
        'What, if anything, is wrong with `subject.excerpt`?'
      )
    },
    rules: [
      {
        name: 'Dismiss reports on harmless content',
        when: (answers) => answers.violates < 0.05 && answers.category === 'fine' && answers.confidence > 0.9,
        then: setState('dismissed')
      },
      {
        name: 'Tag obvious spam',
        when: (answers) => answers.category === 'spam' && answers.violates > 0.95,
        then: tag('spam')
      }
    ]
  })
});
