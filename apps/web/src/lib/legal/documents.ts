import type { LegalDocument } from '@marl/contracts';
import acceptableUse from './documents/acceptable-use.md';
import copyright from './documents/copyright.md';
import privacy from './documents/privacy.md';
import terms from './documents/terms.md';

export const legalDocuments: Record<
  LegalDocument,
  { title: string; label: string; description: string; html: string }
> = {
  terms: {
    title: 'Terms of Service',
    label: 'Terms',
    description: 'The agreement between you and Lantharos for using Marl.',
    html: terms
  },
  privacy: {
    title: 'Privacy Policy',
    label: 'Privacy',
    description: 'What personal information Marl collects, why, and the choices you have.',
    html: privacy
  },
  'acceptable-use': {
    title: 'Acceptable Use Policy',
    label: 'Acceptable use',
    description: 'What is not allowed on Marl, and how reports are handled.',
    html: acceptableUse
  },
  copyright: {
    title: 'Copyright and takedowns',
    label: 'Copyright',
    description: 'How to report infringing content on Marl, and how to file a counter notice.',
    html: copyright
  }
};

export function isLegalDocument(value: string): value is LegalDocument {
  return value in legalDocuments;
}
